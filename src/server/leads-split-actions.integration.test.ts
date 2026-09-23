/**
 * Runs the REAL sales-lead and manual-client-lead actions (createLead,
 * updateLead, createManualClientLead) against an embedded PGlite database
 * with the real workspace-guards (assertWorkspaceClient, assertWorkspaceMember)
 * — not mocked — so cross-workspace client rejection is genuinely exercised.
 * Proves the sales/client leads split holds at the action layer: a sales
 * lead never gets a clientId field at all (removed from leadSchema), and a
 * manually-logged client lead lands in client_leads, never leads.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import { clientLeads } from "@/lib/db/schema";
import { toDateOnlyString, clientLeadReceivedLabel } from "@/lib/date-tz";

const revalidatePath = vi.fn();
const revalidateGoalPaths = vi.fn();
const logActivity = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/server/activity", () => ({ logActivity: (...args: unknown[]) => logActivity(...args) }));
vi.mock("@/server/actions/revalidate-goals", () => ({ revalidateGoalPaths: (...args: unknown[]) => revalidateGoalPaths(...args) }));
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

import { createLead, updateLead, createManualClientLead } from "@/server/actions/leads";
import { listLeads } from "@/server/queries/leads";
import { guardDeps } from "@/server/workspace-guards";

const WS1 = "11111111-1111-4111-8111-111111111111";
const WS2 = "22222222-2222-4222-8222-222222222222";
const CLIENT1 = "33333333-3333-4333-8333-333333333333";
const CLIENT_OTHER_WS = "44444444-4444-4444-8444-444444444444";
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
  const db = drizzle(client);
  (globalThis as Record<string, unknown>).__testDb = db;
  guardDeps.db = db as unknown as typeof guardDeps.db;

  await client.exec(`
    CREATE TABLE profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL DEFAULT 'User');
    CREATE TABLE workspace_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id uuid NOT NULL);
    CREATE TABLE clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL);
    CREATE TABLE leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      client_id uuid,
      company text NOT NULL,
      contact_name text,
      email text,
      phone text,
      source text,
      status text NOT NULL DEFAULT 'new',
      service_interest text,
      estimated_value numeric(12,2),
      estimated_mrr numeric(12,2),
      closed_value numeric(12,2),
      owner_id uuid,
      next_follow_up_at timestamptz,
      last_contacted_at timestamptz,
      received_at timestamptz NOT NULL DEFAULT now(),
      estimate_scheduled_at timestamptz,
      won_at timestamptz,
      lost_at timestamptz,
      notes text,
      internal_notes text,
      converted_client_id uuid,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE client_leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      client_id uuid NOT NULL,
      name text NOT NULL,
      email text,
      phone text,
      source text,
      status text NOT NULL DEFAULT 'new',
      requested_service text,
      estimated_value numeric(12,2),
      closed_value numeric(12,2),
      owner_id uuid,
      external_message_id text,
      ingestion_source text,
      dedupe_key text,
      received_on date,
      received_at timestamptz NOT NULL DEFAULT now(),
      last_contacted_at timestamptz,
      estimate_scheduled_at timestamptz,
      won_at timestamptz,
      lost_at timestamptz,
      notes text,
      internal_notes text,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX client_leads_workspace_external_message_unique
      ON client_leads (workspace_id, external_message_id)
      WHERE external_message_id IS NOT NULL;
    CREATE UNIQUE INDEX client_leads_workspace_client_dedupe_key_unique
      ON client_leads (workspace_id, client_id, dedupe_key)
      WHERE dedupe_key IS NOT NULL;
    CREATE TABLE activity_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, actor_id uuid,
      action text NOT NULL, entity_type text NOT NULL, entity_id uuid, client_id uuid,
      lead_id uuid, opportunity_id uuid, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO clients (id, workspace_id) VALUES ('${CLIENT1}', '${WS1}'), ('${CLIENT_OTHER_WS}', '${WS2}');
    INSERT INTO workspace_members (workspace_id, user_id) VALUES ('${WS1}', '${USER1}');
  `);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  revalidatePath.mockClear();
  revalidateGoalPaths.mockClear();
  logActivity.mockClear();
  setCtx("admin");
  await client.exec(`DELETE FROM leads; DELETE FROM client_leads;`);
});

describe("createLead / updateLead — sales prospects have no client concept at all", () => {
  it("createLead never accepts or stores a clientId — the field doesn't exist on leadSchema", async () => {
    setCtx("member");
    const result = await createLead({ company: "Acme Roofing", status: "new", clientId: CLIENT1 } as unknown);
    expect(result.ok).toBe(true);
    const { rows } = await client.query<Record<string, unknown>>(`SELECT * FROM leads`);
    expect(rows[0].client_id).toBeNull(); // the extraneous clientId in the input was simply dropped by the schema
  });

  it("a sales lead never appears in listLeads if it somehow has a client_id (defensive filter for legacy rows)", async () => {
    await client.exec(`INSERT INTO leads (workspace_id, company, client_id, status) VALUES ('${WS1}', 'Legacy Client Lead', '${CLIENT1}', 'new')`);
    await client.exec(`INSERT INTO leads (workspace_id, company, status) VALUES ('${WS1}', 'Real Sales Prospect', 'new')`);
    const result = await listLeads(WS1);
    expect(result.map((l) => l.company)).toEqual(["Real Sales Prospect"]);
  });

  it("updateLead cannot be used to attach a client to a sales lead", async () => {
    setCtx("member");
    const created = await createLead({ company: "Acme Roofing", status: "new" });
    const id = (created as { ok: true; data: { id: string } }).data.id;
    await updateLead(id, { company: "Acme Roofing", status: "contacted", clientId: CLIENT1 } as unknown);
    const [row] = await client.query<{ client_id: string | null }>(`SELECT client_id FROM leads WHERE id = '${id}'`).then((r) => r.rows);
    expect(row.client_id).toBeNull();
  });
});

describe("createManualClientLead — staff logging a lead on a client's behalf", () => {
  it("requires admin — a member is rejected", async () => {
    setCtx("member");
    const result = await createManualClientLead({
      clientId: CLIENT1, name: "Jane Homeowner", source: "Manual", receivedOn: "2026-07-01", status: "new",
    });
    expect(result.ok).toBe(false);
  });

  it("writes to client_leads, never to leads", async () => {
    setCtx("admin");
    const result = await createManualClientLead({
      clientId: CLIENT1, name: "Jane Homeowner", source: "Manual", receivedOn: "2026-07-01", status: "new",
    });
    expect(result.ok).toBe(true);
    const salesRows = await client.query(`SELECT * FROM leads`);
    expect(salesRows.rows).toHaveLength(0);
    const db = (globalThis as Record<string, unknown>).__testDb as ReturnType<typeof drizzle>;
    const [clientLeadRow] = await db.select().from(clientLeads).where(eq(clientLeads.clientId, CLIENT1));
    expect(clientLeadRow.name).toBe("Jane Homeowner");
    expect(toDateOnlyString(clientLeadRow.receivedOn)).toBe("2026-07-01");
    expect(clientLeadRow.receivedAt.toISOString()).not.toBe("2026-07-01T00:00:00.000Z");
    expect(clientLeadReceivedLabel(clientLeadRow.receivedOn, clientLeadRow.receivedAt)).toBe("Jul 1, 2026");
    expect(clientLeadRow.ingestionSource).toBe("manual");
  });

  it("returns the existing lead when the same external_message_id is submitted again", async () => {
    setCtx("admin");
    const first = await createManualClientLead({
      clientId: CLIENT1, name: "Lynda Laymon", source: "Website", receivedOn: "2026-09-22", status: "new",
      externalMessageId: "gmail-msg-1", ingestionSource: "gmail",
    });
    const second = await createManualClientLead({
      clientId: CLIENT1, name: "Lynda Laymon", source: "Website", receivedOn: "2026-09-22", status: "new",
      externalMessageId: "gmail-msg-1", ingestionSource: "gmail",
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.data?.duplicate).toBe(false);
    expect(second.data).toEqual({ id: first.data?.id, duplicate: true });
    const db = (globalThis as Record<string, unknown>).__testDb as ReturnType<typeof drizzle>;
    const rows = await db.select().from(clientLeads).where(and(eq(clientLeads.workspaceId, WS1), eq(clientLeads.externalMessageId, "gmail-msg-1")));
    expect(rows).toHaveLength(1);
    expect(toDateOnlyString(rows[0].receivedOn)).toBe("2026-09-22");
    expect(clientLeadReceivedLabel(rows[0].receivedOn, rows[0].receivedAt)).toBe("Sep 22, 2026");
  });

  it("rejects a client that belongs to a different workspace (workspace isolation)", async () => {
    setCtx("admin");
    const result = await createManualClientLead({
      clientId: CLIENT_OTHER_WS, name: "Cross Workspace", source: "Manual", receivedOn: "2026-07-01", status: "new",
    });
    expect(result.ok).toBe(false);
  });

  it("does not trigger the sales new_leads goal metric revalidation", async () => {
    setCtx("admin");
    await createManualClientLead({ clientId: CLIENT1, name: "No Goal Impact", source: "Manual", receivedOn: "2026-07-01", status: "new" });
    expect(revalidateGoalPaths).not.toHaveBeenCalled();
  });
});

describe("sales and client leads never cross-contaminate each other's counts", () => {
  it("listLeads and client_leads rows stay in their own tables even when created back to back", async () => {
    setCtx("member");
    await createLead({ company: "Sales Prospect Co", status: "new" });
    setCtx("admin");
    await createManualClientLead({ clientId: CLIENT1, name: "Client Lead Person", source: "Manual", receivedOn: "2026-07-01", status: "new" });

    const salesLeads = await listLeads(WS1);
    expect(salesLeads).toHaveLength(1);
    expect(salesLeads[0].company).toBe("Sales Prospect Co");

    const db = (globalThis as Record<string, unknown>).__testDb as ReturnType<typeof drizzle>;
    const clientLeadRows = await db.select().from(clientLeads).where(eq(clientLeads.workspaceId, WS1));
    expect(clientLeadRows).toHaveLength(1);
    expect(clientLeadRows[0].name).toBe("Client Lead Person");
  });
});
