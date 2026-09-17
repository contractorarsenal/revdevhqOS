/**
 * Runs the REAL client-request server actions (createClientRequest,
 * updateClientRequestStatus, triageClientRequestToTask) against an embedded
 * PGlite database. Proves the request/task distinction — triaging creates
 * a separate task row and links it, it never overwrites the request itself
 * — and that a request can't be triaged twice.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { clientRequests, tasks } from "@/lib/db/schema";

const revalidatePath = vi.fn();
const logActivity = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/server/activity", () => ({ logActivity: (...args: unknown[]) => logActivity(...args) }));
vi.mock("@/server/workspace-guards", () => ({
  assertWorkspaceClient: vi.fn(async () => {}),
  assertWorkspaceMember: vi.fn(async () => {}),
}));
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, {
    get(_t, prop) {
      const target = (globalThis as Record<string, unknown>).__testDb as Record<string, unknown>;
      const value = target[prop as string];
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  }),
}));
vi.mock("@/server/authorize", async () => {
  const { actionError } = await import("@/server/action-error");
  const { assertRole } = await import("@/lib/permissions");
  return {
    actionError,
    authorize: async (minRole: "owner" | "admin" | "manager" | "member" | "viewer" = "viewer") => {
      const ctx = (globalThis as Record<string, unknown>).__testCtx as { role: Parameters<typeof assertRole>[0] };
      assertRole(ctx.role, minRole);
      return ctx;
    },
  };
});

import { createClientRequest, updateClientRequestStatus, triageClientRequestToTask } from "@/server/actions/client-requests";

const WS1 = "11111111-1111-4111-8111-111111111111";
const CLIENT1 = "33333333-3333-4333-8333-333333333333";
const USER1 = "55555555-5555-4555-8555-555555555555";

let client: PGlite;

function setCtx(role: string) {
  (globalThis as Record<string, unknown>).__testCtx = {
    workspace: { id: WS1, timezone: "America/Los_Angeles" },
    user: { id: USER1, name: "Test User" },
    role,
  };
}

beforeAll(async () => {
  client = new PGlite();
  (globalThis as Record<string, unknown>).__testDb = drizzle(client);
  await client.exec(`
    CREATE TABLE client_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      client_id uuid NOT NULL,
      type text NOT NULL DEFAULT 'other',
      status text NOT NULL DEFAULT 'new',
      description text NOT NULL,
      priority text NOT NULL DEFAULT 'medium',
      submitted_by uuid,
      task_id uuid,
      resolution_notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      title text NOT NULL,
      description text,
      status text NOT NULL DEFAULT 'todo',
      priority text NOT NULL DEFAULT 'medium',
      assignee_id uuid,
      client_id uuid,
      lead_id uuid,
      opportunity_id uuid,
      due_date timestamptz,
      project_id uuid,
      scheduled_date date,
      scheduled_start_time text,
      scheduled_end_time text,
      all_day boolean NOT NULL DEFAULT false,
      calendar_visible boolean NOT NULL DEFAULT true,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  revalidatePath.mockClear();
  logActivity.mockClear();
  setCtx("member");
  await client.exec(`DELETE FROM client_requests; DELETE FROM tasks;`);
});

async function requestRow(id: string) {
  const db = (globalThis as Record<string, unknown>).__testDb as ReturnType<typeof drizzle>;
  const [r] = await db.select().from(clientRequests).where(eq(clientRequests.id, id));
  return r;
}

describe("createClientRequest", () => {
  it("staff can log a request on a client's behalf", async () => {
    const result = await createClientRequest({ clientId: CLIENT1, type: "bug", description: "Contact form is broken" });
    expect(result.ok).toBe(true);
    const { rows } = await client.query<{ status: string; submitted_by: string }>(`SELECT status, submitted_by FROM client_requests`);
    expect(rows[0].status).toBe("new");
    expect(rows[0].submitted_by).toBe(USER1);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "client_request.created" }));
  });

  it("rejects a viewer trying to log a request", async () => {
    setCtx("viewer");
    const result = await createClientRequest({ clientId: CLIENT1, type: "bug", description: "x" });
    expect(result.ok).toBe(false);
  });
});

describe("updateClientRequestStatus", () => {
  it("moves a request through its lifecycle and records resolution notes", async () => {
    const created = await createClientRequest({ clientId: CLIENT1, type: "content_revision", description: "Update hours" });
    const { rows } = await client.query<{ id: string }>(`SELECT id FROM client_requests`);
    const id = rows[0].id;
    void created;

    const result = await updateClientRequestStatus(id, { status: "complete", resolutionNotes: "Updated on the site." });
    expect(result.ok).toBe(true);
    const r = await requestRow(id);
    expect(r.status).toBe("complete");
    expect(r.resolutionNotes).toBe("Updated on the site.");
  });
});

describe("triageClientRequestToTask", () => {
  it("creates a separate task, links it, and moves the request to in_progress", async () => {
    await createClientRequest({ clientId: CLIENT1, type: "new_page", description: "Add a careers page" });
    const { rows } = await client.query<{ id: string }>(`SELECT id FROM client_requests`);
    const id = rows[0].id;

    const result = await triageClientRequestToTask(id, { taskTitle: "Build careers page", assigneeId: "", dueDate: "" });
    expect(result.ok).toBe(true);
    const taskId = (result as { ok: true; data: { taskId: string } }).data.taskId;

    const r = await requestRow(id);
    expect(r.status).toBe("in_progress");
    expect(r.taskId).toBe(taskId);
    expect(r.description).toBe("Add a careers page"); // the request itself is untouched — a separate record from the task

    const db = (globalThis as Record<string, unknown>).__testDb as ReturnType<typeof drizzle>;
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect(task.title).toBe("Build careers page");
    expect(task.clientId).toBe(CLIENT1);
  });

  it("rejects triaging a request that already has a linked task", async () => {
    await createClientRequest({ clientId: CLIENT1, type: "bug", description: "x" });
    const { rows } = await client.query<{ id: string }>(`SELECT id FROM client_requests`);
    const id = rows[0].id;
    await triageClientRequestToTask(id, { taskTitle: "First task", assigneeId: "", dueDate: "" });

    const second = await triageClientRequestToTask(id, { taskTitle: "Second task", assigneeId: "", dueDate: "" });
    expect(second.ok).toBe(false);
  });
});
