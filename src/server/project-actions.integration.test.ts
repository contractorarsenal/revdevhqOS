/**
 * Runs the REAL project server actions (createProject, updateProject,
 * archiveProject) against an embedded PGlite database. Covers the Slice 4
 * relabeling: "live" (not the retired "completed") now stamps completedAt
 * for the projects_completed goal metric, and archiveProject now sets the
 * new "closed" status (not the retired "archived") while still stamping
 * archivedAt.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { projects } from "@/lib/db/schema";

const revalidatePath = vi.fn();
const revalidateGoalPaths = vi.fn();
const logActivity = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/server/activity", () => ({ logActivity: (...args: unknown[]) => logActivity(...args) }));
vi.mock("@/server/actions/revalidate-goals", () => ({ revalidateGoalPaths: (...args: unknown[]) => revalidateGoalPaths(...args) }));
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

import { createProject, updateProject, archiveProject } from "@/server/actions/projects";

const WS1 = "11111111-1111-4111-8111-111111111111";
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
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      name text NOT NULL,
      description text,
      status text NOT NULL DEFAULT 'ready_to_build',
      owner_id uuid,
      client_id uuid,
      start_date date,
      due_date date,
      color text,
      waiting_on text,
      next_action text,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      archived_at timestamptz
    );
  `);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  revalidatePath.mockClear();
  revalidateGoalPaths.mockClear();
  logActivity.mockClear();
  setCtx("member");
  await client.exec(`DELETE FROM projects;`);
});

async function row(id: string) {
  const db = (globalThis as Record<string, unknown>).__testDb as ReturnType<typeof drizzle>;
  const [r] = await db.select().from(projects).where(eq(projects.id, id));
  return r;
}

describe("createProject / updateProject persist waitingOn and nextAction", () => {
  it("creates a project with waiting-on and next-action set", async () => {
    const result = await createProject({
      name: "Acme website rebuild", status: "building", waitingOn: "Client photos", nextAction: "Draft homepage copy",
    });
    expect(result.ok).toBe(true);
    const r = await row((result as { ok: true; data: { id: string } }).data.id);
    expect(r.waitingOn).toBe("Client photos");
    expect(r.nextAction).toBe("Draft homepage copy");
  });

  it("clears waiting-on and next-action when left blank on update", async () => {
    const created = await createProject({ name: "Acme site", status: "building", waitingOn: "Something", nextAction: "Something else" });
    const id = (created as { ok: true; data: { id: string } }).data.id;
    const result = await updateProject(id, { name: "Acme site", status: "building" });
    expect(result.ok).toBe(true);
    const r = await row(id);
    expect(r.waitingOn).toBeNull();
    expect(r.nextAction).toBeNull();
  });
});

describe("status 'live' (not the retired 'completed') drives completedAt and the goal metric", () => {
  it("stamps completedAt on create when status is 'live'", async () => {
    const result = await createProject({ name: "Launched site", status: "live" });
    const id = (result as { ok: true; data: { id: string } }).data.id;
    expect((await row(id)).completedAt).not.toBeNull();
    expect(revalidateGoalPaths).toHaveBeenCalled();
  });

  it("stamps completedAt on transition into 'live', clears it on transition away", async () => {
    const created = await createProject({ name: "Building site", status: "building" });
    const id = (created as { ok: true; data: { id: string } }).data.id;
    expect((await row(id)).completedAt).toBeNull();

    await updateProject(id, { name: "Building site", status: "live" });
    expect((await row(id)).completedAt).not.toBeNull();

    await updateProject(id, { name: "Building site", status: "revisions" });
    expect((await row(id)).completedAt).toBeNull();
  });
});

describe("archiveProject sets the new 'closed' status, not the retired 'archived'", () => {
  it("sets status to closed and stamps archivedAt", async () => {
    const created = await createProject({ name: "Old project", status: "paused" });
    const id = (created as { ok: true; data: { id: string } }).data.id;
    setCtx("manager");
    const result = await archiveProject(id);
    expect(result.ok).toBe(true);
    const r = await row(id);
    expect(r.status).toBe("closed");
    expect(r.archivedAt).not.toBeNull();
  });
});
