/**
 * Runs the REAL team-management server actions (inviteMember,
 * updateMemberRole, removeMember) against an embedded PGlite database, with
 * only process boundaries mocked: authorize() resolves a configurable test
 * context (through the real assertRole matrix), Supabase Auth admin calls
 * are faked, activity logging and revalidatePath are spies. Proves the
 * whole pipeline — zod validation, the "at least one owner" guard, the
 * "existing auth user" invite fallback, and self-removal protection.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { workspaceMembers } from "@/lib/db/schema";

const revalidatePath = vi.fn();
const logActivity = vi.fn();
const inviteUserByEmail = vi.fn();
const listUsers = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/server/activity", () => ({ logActivity: (...args: unknown[]) => logActivity(...args) }));
vi.mock("@/lib/env/server", () => ({ env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { inviteUserByEmail: (...a: unknown[]) => inviteUserByEmail(...a), listUsers: (...a: unknown[]) => listUsers(...a) } },
  }),
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

import { inviteMember, updateMemberRole, removeMember } from "@/server/actions/members";

const WS1 = "11111111-1111-4111-8111-111111111111";
const OWNER1 = "55555555-5555-4555-8555-555555555555";
const OWNER2 = "66666666-6666-4666-8666-666666666666";
const MEMBER1 = "77777777-7777-4777-8777-777777777777";
const NEW_AUTH_ID = "88888888-8888-4888-8888-888888888888";

let client: PGlite;

function setCtx(userId: string, role: string) {
  (globalThis as Record<string, unknown>).__testCtx = {
    workspace: { id: WS1, timezone: "America/Los_Angeles" },
    user: { id: userId, name: "Test Owner" },
    role,
  };
}

beforeAll(async () => {
  client = new PGlite();
  (globalThis as Record<string, unknown>).__testDb = drizzle(client);
  await client.exec(`
    CREATE TABLE profiles (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE workspace_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      user_id uuid NOT NULL,
      role text NOT NULL DEFAULT 'member',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
});

afterAll(async () => {
  await client.close();
});

async function seedProfile(id: string, name: string, email: string) {
  await client.query(`INSERT INTO profiles (id, name, email) VALUES ('${id}', '${name}', '${email}')`);
}

async function seedMember(userId: string, role: string): Promise<string> {
  const row = await client.query<{ id: string }>(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ('${WS1}', '${userId}', '${role}') RETURNING id`
  );
  return row.rows[0].id;
}

async function memberRole(id: string) {
  const db = (globalThis as Record<string, unknown>).__testDb as ReturnType<typeof drizzle>;
  const [row] = await db.select().from(workspaceMembers).where(eq(workspaceMembers.id, id));
  return row?.role;
}

beforeEach(async () => {
  revalidatePath.mockClear();
  logActivity.mockClear();
  inviteUserByEmail.mockReset();
  listUsers.mockReset();
  await client.exec(`DELETE FROM workspace_members; DELETE FROM profiles;`);
  await seedProfile(OWNER1, "Owner One", "owner1@example.com");
  await seedMember(OWNER1, "owner");
  setCtx(OWNER1, "owner");
});

describe("inviteMember", () => {
  it("creates a new Supabase Auth user, profile, and membership for a brand-new email", async () => {
    inviteUserByEmail.mockResolvedValue({ data: { user: { id: NEW_AUTH_ID } }, error: null });
    const result = await inviteMember({ email: "new@contractorarsenal.com", name: "New Hire", role: "member" });
    expect(result.ok).toBe(true);
    expect(inviteUserByEmail).toHaveBeenCalledWith("new@contractorarsenal.com", expect.objectContaining({ data: { name: "New Hire" } }));
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "member.invited" }));
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("reuses an existing Supabase Auth identity instead of failing when the email is already registered", async () => {
    inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: { message: "User already registered" } });
    listUsers.mockResolvedValue({ data: { users: [{ id: NEW_AUTH_ID, email: "existing@contractorarsenal.com" }] }, error: null });
    const result = await inviteMember({ email: "existing@contractorarsenal.com", name: "Existing Person", role: "viewer" });
    expect(result.ok).toBe(true);
  });

  it("rejects inviting someone who is already a member of this workspace", async () => {
    await seedProfile(MEMBER1, "Already Here", "already@contractorarsenal.com");
    await seedMember(MEMBER1, "member");
    const result = await inviteMember({ email: "already@contractorarsenal.com", name: "Already Here", role: "admin" });
    expect(result.ok).toBe(false);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("rejects invites from a non-owner", async () => {
    setCtx(OWNER1, "admin");
    const result = await inviteMember({ email: "new@contractorarsenal.com", name: "New Hire", role: "member" });
    expect(result.ok).toBe(false);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });
});

describe("updateMemberRole — at least one owner is always preserved", () => {
  it("allows demoting an owner when another owner remains", async () => {
    await seedProfile(OWNER2, "Owner Two", "owner2@example.com");
    const secondOwnerId = await seedMember(OWNER2, "owner");
    const result = await updateMemberRole(secondOwnerId, { role: "admin" });
    expect(result.ok).toBe(true);
    expect(await memberRole(secondOwnerId)).toBe("admin");
  });

  it("rejects demoting the last remaining owner", async () => {
    const [self] = await client.query<{ id: string }>(`SELECT id FROM workspace_members WHERE user_id = '${OWNER1}'`).then((r) => r.rows);
    const result = await updateMemberRole(self.id, { role: "admin" });
    expect(result.ok).toBe(false);
    expect(await memberRole(self.id)).toBe("owner");
  });
});

describe("removeMember", () => {
  it("removes a non-owner's workspace access", async () => {
    await seedProfile(MEMBER1, "Regular Member", "member@example.com");
    const memberId = await seedMember(MEMBER1, "member");
    const result = await removeMember(memberId);
    expect(result.ok).toBe(true);
    expect(await memberRole(memberId)).toBeUndefined();
  });

  it("rejects removing your own access", async () => {
    const [self] = await client.query<{ id: string }>(`SELECT id FROM workspace_members WHERE user_id = '${OWNER1}'`).then((r) => r.rows);
    const result = await removeMember(self.id);
    expect(result.ok).toBe(false);
    expect(await memberRole(self.id)).toBe("owner");
  });

  it("once down to a sole owner, that owner cannot remove their own last-owner access", async () => {
    await seedProfile(OWNER2, "Owner Two", "owner2@example.com");
    const secondOwnerId = await seedMember(OWNER2, "owner");
    const [ownerOneRow] = await client.query<{ id: string }>(`SELECT id FROM workspace_members WHERE user_id = '${OWNER1}'`).then((r) => r.rows);

    // OWNER2 removes OWNER1, leaving itself as the sole owner.
    setCtx(OWNER2, "owner");
    expect((await removeMember(ownerOneRow.id)).ok).toBe(true);

    // OWNER2 can no longer remove itself — blocked by the self-removal guard,
    // which also happens to be the only owner left.
    const result = await removeMember(secondOwnerId);
    expect(result.ok).toBe(false);
    expect(await memberRole(secondOwnerId)).toBe("owner");
  });
});
