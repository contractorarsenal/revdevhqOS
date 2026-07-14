/**
 * PGlite integration tests for the client-portal feature: the REAL
 * migration SQL (drizzle/0013 + 0014) runs against embedded Postgres, then
 * the production drizzle query builders (clientLeadSummary) are exercised
 * against it. Prerequisite tables owned by earlier migrations are minimal
 * stubs with production column names so FKs and ALTERs apply for real.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { and, eq, isNull } from "drizzle-orm";
import { clientPortalInvites, clientPortalMemberships } from "@/lib/db/schema";
import { clientLeadSummary } from "@/server/queries/client-leads";
import { generateInviteToken } from "@/server/portal-tokens";

const TZ = "America/Los_Angeles";
let client: PGlite;
let db: PgliteDatabase;

const WS1 = "11111111-1111-1111-1111-111111111111";
const WS2 = "22222222-2222-2222-2222-222222222222";
const CLIENT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CLIENT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROFILE_1 = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const PROFILE_2 = "dddddddd-dddd-dddd-dddd-dddddddddddd";

async function runMigrationFile(file: string) {
  const sqlText = readFileSync(join(process.cwd(), "drizzle", file), "utf8");
  for (const stmt of sqlText.split("--> statement-breakpoint")) {
    const trimmed = stmt.trim();
    if (trimmed) await client.exec(trimmed);
  }
}

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client);
  await client.exec(`
    CREATE TABLE workspaces (id uuid PRIMARY KEY);
    CREATE TABLE profiles (id uuid PRIMARY KEY);
    CREATE TABLE clients (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      industry text
    );
    CREATE TABLE contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      client_id uuid NOT NULL,
      name text NOT NULL,
      email text,
      is_primary boolean NOT NULL DEFAULT false
    );
    CREATE TABLE leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'new',
      estimated_value numeric(12,2),
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO workspaces (id) VALUES ('${WS1}'), ('${WS2}');
    INSERT INTO profiles (id) VALUES ('${PROFILE_1}'), ('${PROFILE_2}');
    INSERT INTO clients (id, workspace_id) VALUES ('${CLIENT_A}', '${WS1}'), ('${CLIENT_B}', '${WS1}');
  `);
  await runMigrationFile("0013_green_kang.sql");
  await runMigrationFile("0014_client_portal_rls.sql");
});

afterAll(async () => {
  await client.close();
});

describe("migration SQL", () => {
  it("enables Row Level Security on both new tables", async () => {
    const res = await client.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('client_portal_invites','client_portal_memberships')`
    );
    expect(res.rows).toHaveLength(2);
    for (const row of res.rows) expect(row.relrowsecurity).toBe(true);
  });

  it("adds clients.portal_accent_color and leads.client_id additively", async () => {
    const cols = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE (table_name='clients' AND column_name='portal_accent_color')
          OR (table_name='leads' AND column_name='client_id')`
    );
    expect(cols.rows).toHaveLength(2);
  });

  it("rejects invites for unknown workspaces (FK)", async () => {
    await expect(
      db.insert(clientPortalInvites).values({
        workspaceId: "99999999-9999-9999-9999-999999999999",
        clientId: CLIENT_A, email: "x@y.com", tokenHash: "h0", expiresAt: new Date(),
      })
    ).rejects.toThrow();
  });
});

describe("primary contact uniqueness", () => {
  it("allows exactly one primary contact per client, and one per client across clients", async () => {
    await client.exec(`
      INSERT INTO contacts (workspace_id, client_id, name, email, is_primary)
      VALUES ('${WS1}', '${CLIENT_A}', 'Dana', 'dana@a.com', true),
             ('${WS1}', '${CLIENT_A}', 'Historical', 'old@a.com', false),
             ('${WS1}', '${CLIENT_B}', 'Ben', 'ben@b.com', true);
    `);
    await expect(
      client.exec(`INSERT INTO contacts (workspace_id, client_id, name, is_primary) VALUES ('${WS1}', '${CLIENT_A}', 'Second Primary', true)`)
    ).rejects.toThrow();
  });
});

describe("invite lifecycle at the database level", () => {
  it("token hashes are unique — a duplicate hash cannot be stored", async () => {
    const { tokenHash } = generateInviteToken();
    await db.insert(clientPortalInvites).values({ workspaceId: WS1, clientId: CLIENT_A, email: "dana@a.com", tokenHash, expiresAt: new Date(Date.now() + 86400000) });
    await expect(
      db.insert(clientPortalInvites).values({ workspaceId: WS1, clientId: CLIENT_A, email: "dana@a.com", tokenHash, expiresAt: new Date(Date.now() + 86400000) })
    ).rejects.toThrow();
  });

  it("the one-time claim (conditional UPDATE) succeeds once and never twice", async () => {
    const { tokenHash } = generateInviteToken();
    const [inv] = await db.insert(clientPortalInvites).values({ workspaceId: WS1, clientId: CLIENT_A, email: "dana@a.com", tokenHash, expiresAt: new Date(Date.now() + 86400000) }).returning();
    const first = await db.update(clientPortalInvites).set({ acceptedAt: new Date() })
      .where(and(eq(clientPortalInvites.id, inv.id), isNull(clientPortalInvites.acceptedAt), isNull(clientPortalInvites.revokedAt)))
      .returning({ id: clientPortalInvites.id });
    expect(first).toHaveLength(1);
    const second = await db.update(clientPortalInvites).set({ acceptedAt: new Date() })
      .where(and(eq(clientPortalInvites.id, inv.id), isNull(clientPortalInvites.acceptedAt), isNull(clientPortalInvites.revokedAt)))
      .returning({ id: clientPortalInvites.id });
    expect(second).toHaveLength(0);
  });

  it("a revoked invite cannot be claimed", async () => {
    const { tokenHash } = generateInviteToken();
    const [inv] = await db.insert(clientPortalInvites).values({ workspaceId: WS1, clientId: CLIENT_A, email: "dana@a.com", tokenHash, expiresAt: new Date(Date.now() + 86400000), revokedAt: new Date() }).returning();
    const claim = await db.update(clientPortalInvites).set({ acceptedAt: new Date() })
      .where(and(eq(clientPortalInvites.id, inv.id), isNull(clientPortalInvites.acceptedAt), isNull(clientPortalInvites.revokedAt)))
      .returning({ id: clientPortalInvites.id });
    expect(claim).toHaveLength(0);
  });
});

describe("membership constraints", () => {
  it("blocks duplicate memberships for the same client+profile, allows the same profile on another client", async () => {
    const [m] = await db.insert(clientPortalMemberships).values({ workspaceId: WS1, clientId: CLIENT_A, profileId: PROFILE_1, status: "active" }).returning();
    await expect(
      db.insert(clientPortalMemberships).values({ workspaceId: WS1, clientId: CLIENT_A, profileId: PROFILE_1, status: "suspended" })
    ).rejects.toThrow();
    const [other] = await db.insert(clientPortalMemberships).values({ workspaceId: WS1, clientId: CLIENT_B, profileId: PROFILE_1, status: "active" }).returning();
    expect(other.id).not.toBe(m.id);
    await db.delete(clientPortalMemberships).where(eq(clientPortalMemberships.id, other.id));
  });

  it("status transitions cover suspend and restore without new rows", async () => {
    await db.update(clientPortalMemberships).set({ status: "suspended", suspendedAt: new Date() })
      .where(and(eq(clientPortalMemberships.clientId, CLIENT_A), eq(clientPortalMemberships.profileId, PROFILE_1)));
    let [m] = await db.select().from(clientPortalMemberships)
      .where(and(eq(clientPortalMemberships.clientId, CLIENT_A), eq(clientPortalMemberships.profileId, PROFILE_1)));
    expect(m.status).toBe("suspended");
    await db.update(clientPortalMemberships).set({ status: "active", suspendedAt: null }).where(eq(clientPortalMemberships.id, m.id));
    [m] = await db.select().from(clientPortalMemberships).where(eq(clientPortalMemberships.id, m.id));
    expect(m.status).toBe("active");
  });

  it("workspace scoping: a membership fetched with the wrong workspace id returns nothing", async () => {
    const cross = await db.select().from(clientPortalMemberships)
      .where(and(eq(clientPortalMemberships.clientId, CLIENT_A), eq(clientPortalMemberships.workspaceId, WS2)));
    expect(cross).toHaveLength(0);
  });
});

describe("client lead summary runs the production query builders", () => {
  const TODAY = "2026-07-14"; // Tuesday → week is Jul 13–19; month is July

  it("counts are client-scoped, archived leads excluded, statuses mapped", async () => {
    await client.exec(`
      INSERT INTO leads (workspace_id, client_id, status, estimated_value, created_at, archived_at) VALUES
        ('${WS1}', '${CLIENT_A}', 'new',       500,  '2026-07-14T18:00:00Z', NULL),
        ('${WS1}', '${CLIENT_A}', 'contacted', NULL, '2026-07-02T18:00:00Z', NULL),
        ('${WS1}', '${CLIENT_A}', 'converted', 1500, '2026-06-10T18:00:00Z', NULL),
        ('${WS1}', '${CLIENT_A}', 'lost',      NULL, '2026-06-05T18:00:00Z', NULL),
        ('${WS1}', '${CLIENT_A}', 'new',       999,  '2026-07-14T19:00:00Z', '2026-07-14T20:00:00Z'),
        ('${WS1}', '${CLIENT_B}', 'new',       NULL, '2026-07-14T18:00:00Z', NULL),
        ('${WS1}', NULL,          'new',       NULL, '2026-07-14T18:00:00Z', NULL);
    `);
    const a = await clientLeadSummary(db, WS1, CLIENT_A, TZ, TODAY);
    expect(a.total).toBe(4); // archived excluded, other client/unlinked excluded
    expect(a.thisWeek).toBe(1);
    expect(a.thisMonth).toBe(2);
    expect(a.newCount).toBe(1);
    expect(a.contacted).toBe(1);
    expect(a.won).toBe(1);
    expect(a.lost).toBe(1);
    expect(a.pipelineValue).toBe(2000); // 500 + 1500; archived 999 excluded
    expect(a.avgPerMonth).toBe(2); // 4 leads across Jun–Jul
  });

  it("Client B's summary never includes Client A's leads", async () => {
    const b = await clientLeadSummary(db, WS1, CLIENT_B, TZ, TODAY);
    expect(b.total).toBe(1);
    expect(b.won).toBe(0);
    expect(b.pipelineValue).toBeNull();
  });

  it("cross-workspace summaries are empty even for a real client id", async () => {
    const cross = await clientLeadSummary(db, WS2, CLIENT_A, TZ, TODAY);
    expect(cross.total).toBe(0);
  });
});
