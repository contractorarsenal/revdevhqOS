/**
 * Runs the REAL approvals server actions (createApproval, resolveApproval)
 * against an embedded PGlite database, with only process boundaries mocked:
 * authorize() resolves a configurable test context (through the real
 * assertRole matrix), revalidatePath and activity logging are spies. Proves
 * the whole pipeline — zod validation, the "raise vs resolve" role split,
 * and the "only from pending" guard against double-resolution.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { approvals } from "@/lib/db/schema";

const revalidatePath = vi.fn();
const logActivity = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/server/activity", () => ({ logActivity: (...args: unknown[]) => logActivity(...args) }));
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

import { createApproval, resolveApproval } from "@/server/actions/approvals";

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
    CREATE TABLE approvals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      title text NOT NULL,
      description text,
      type text NOT NULL DEFAULT 'other',
      status text NOT NULL DEFAULT 'pending',
      requested_by uuid,
      client_id uuid,
      project_id uuid,
      lead_id uuid,
      task_id uuid,
      risk_summary text,
      requested_action text,
      resolution_notes text,
      resolved_by uuid,
      resolved_at timestamptz,
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
  await client.exec(`DELETE FROM approvals;`);
});

async function insertPending(): Promise<string> {
  const row = await client.query<{ id: string }>(
    `INSERT INTO approvals (workspace_id, title, requested_by) VALUES ('${WS1}', 'Refund for Acme', '${USER1}') RETURNING id`
  );
  return row.rows[0].id;
}

async function approvalRow(id: string) {
  const db = (globalThis as Record<string, unknown>).__testDb as ReturnType<typeof drizzle>;
  const [row] = await db.select().from(approvals).where(eq(approvals.id, id));
  return row;
}

describe("createApproval", () => {
  it("lets any member raise something for Needs Jay, as pending, attributed to the requester", async () => {
    setCtx("member");
    const result = await createApproval({ title: "Client wants a discount", type: "pricing" });
    expect(result.ok).toBe(true);
    const [row] = await client.query<{ status: string; requested_by: string }>(
      `SELECT status, requested_by FROM approvals`
    ).then((r) => r.rows);
    expect(row.status).toBe("pending");
    expect(row.requested_by).toBe(USER1);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "approval.requested" }));
    expect(revalidatePath).toHaveBeenCalledWith("/approvals");
  });

  it("rejects a viewer trying to raise an approval", async () => {
    setCtx("viewer");
    const result = await createApproval({ title: "Should not work", type: "other" });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing title", async () => {
    setCtx("member");
    const result = await createApproval({ title: "", type: "other" });
    expect(result.ok).toBe(false);
  });
});

describe("resolveApproval — owner-only, and only from pending", () => {
  it("lets an owner approve a pending item, stamping resolver and timestamp", async () => {
    setCtx("owner");
    const id = await insertPending();
    const result = await resolveApproval(id, { status: "approved", resolutionNotes: "Approved for a one-time exception." });
    expect(result.ok).toBe(true);
    const row = await approvalRow(id);
    expect(row.status).toBe("approved");
    expect(row.resolvedBy).toBe(USER1);
    expect(row.resolvedAt).not.toBeNull();
    expect(row.resolutionNotes).toBe("Approved for a one-time exception.");
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "approval.resolved", metadata: { status: "approved" } }));
  });

  it("rejects a non-owner trying to resolve", async () => {
    setCtx("admin");
    const id = await insertPending();
    const result = await resolveApproval(id, { status: "approved", resolutionNotes: "" });
    expect(result.ok).toBe(false);
    expect((await approvalRow(id)).status).toBe("pending");
  });

  it("rejects resolving an already-resolved approval", async () => {
    setCtx("owner");
    const id = await insertPending();
    expect((await resolveApproval(id, { status: "declined", resolutionNotes: "" })).ok).toBe(true);
    const second = await resolveApproval(id, { status: "approved", resolutionNotes: "" });
    expect(second.ok).toBe(false);
    expect((await approvalRow(id)).status).toBe("declined");
  });

  it("rejects an unknown approval id", async () => {
    setCtx("owner");
    const result = await resolveApproval("99999999-9999-4999-8999-999999999999", { status: "approved", resolutionNotes: "" });
    expect(result.ok).toBe(false);
  });
});
