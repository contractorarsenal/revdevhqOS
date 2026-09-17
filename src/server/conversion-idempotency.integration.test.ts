/**
 * Runs the REAL convertLeadToOpportunity (leads.ts) and
 * convertOpportunityToClient (pipeline.ts) actions against an embedded
 * PGlite database. Both actions used to have a broken TOCTOU idempotency
 * guard — a pre-check outside the transaction that a repeated or racing
 * call could pass twice, creating duplicate opportunities/clients. The fix
 * moves the claim into the transaction as a conditional UPDATE ("claim the
 * row, or bail if someone already claimed it") backed by a partial unique
 * index as a database-level backstop. These tests prove: (1) a second,
 * repeated call is rejected and leaves no duplicate row, and (2) two
 * callers racing via Promise.all still produce exactly one winner.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { opportunities, leads, clients } from "@/lib/db/schema";

const revalidatePath = vi.fn();
const logActivity = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/server/activity", () => ({ logActivity: (...args: unknown[]) => logActivity(...args) }));
vi.mock("@/server/actions/revalidate-goals", () => ({ revalidateGoalPaths: vi.fn() }));
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

import { convertLeadToOpportunity } from "@/server/actions/leads";
import { convertOpportunityToClient } from "@/server/actions/pipeline";

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
  const db = drizzle(client);
  (globalThis as Record<string, unknown>).__testDb = db;

  await client.exec(`
    CREATE TABLE profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL DEFAULT 'User');
    CREATE TABLE workspace_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id uuid NOT NULL);
    CREATE TABLE leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, company text NOT NULL,
      contact_name text, email text, phone text, source text, status text NOT NULL DEFAULT 'new',
      service_interest text, estimated_value numeric(12,2), estimated_mrr numeric(12,2), closed_value numeric(12,2),
      owner_id uuid, next_follow_up_at timestamptz, last_contacted_at timestamptz,
      received_at timestamptz NOT NULL DEFAULT now(), estimate_scheduled_at timestamptz, won_at timestamptz,
      lost_at timestamptz, notes text, internal_notes text, converted_client_id uuid, client_id uuid,
      archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE pipeline_stages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, name text NOT NULL,
      position integer NOT NULL DEFAULT 0, probability integer NOT NULL DEFAULT 0,
      is_won boolean NOT NULL DEFAULT false, is_lost boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE clients (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, name text NOT NULL,
      website text, email text, phone text, industry text, portal_accent_color text, address text,
      status text NOT NULL DEFAULT 'onboarding', owner_id uuid, start_date date, archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, client_id uuid NOT NULL,
      name text NOT NULL, title text, email text, phone text, is_primary boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE services (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, name text NOT NULL,
      description text, default_price numeric(12,2), default_frequency text NOT NULL DEFAULT 'monthly',
      archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, client_id uuid NOT NULL,
      service_id uuid NOT NULL, amount numeric(12,2) NOT NULL, frequency text NOT NULL DEFAULT 'monthly',
      status text NOT NULL DEFAULT 'active', start_date date NOT NULL, next_billing_date date, payment_day integer,
      paused_at timestamptz, canceled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, title text NOT NULL,
      description text, status text NOT NULL DEFAULT 'todo', priority text NOT NULL DEFAULT 'medium',
      assignee_id uuid, client_id uuid, lead_id uuid, opportunity_id uuid, due_date timestamptz, project_id uuid,
      scheduled_date date, scheduled_start_time text, scheduled_end_time text,
      all_day boolean NOT NULL DEFAULT false, calendar_visible boolean NOT NULL DEFAULT true,
      completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE opportunities (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, stage_id uuid NOT NULL,
      name text NOT NULL, lead_id uuid, client_id uuid, contact_name text,
      value numeric(12,2) NOT NULL DEFAULT 0, mrr numeric(12,2) NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'open',
      owner_id uuid, expected_close_date date, won_at timestamptz, lost_at timestamptz, lost_reason text,
      position integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX opportunities_lead_id_unique ON opportunities (lead_id) WHERE lead_id IS NOT NULL;
    INSERT INTO workspace_members (workspace_id, user_id) VALUES ('${WS1}', '${USER1}');
  `);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  revalidatePath.mockClear();
  logActivity.mockClear();
  setCtx("member");
  await client.exec(`DELETE FROM opportunities; DELETE FROM leads; DELETE FROM clients; DELETE FROM contacts; DELETE FROM subscriptions; DELETE FROM services; DELETE FROM tasks; DELETE FROM pipeline_stages;`);
  await client.exec(`INSERT INTO pipeline_stages (workspace_id, name, position, is_won) VALUES ('${WS1}', 'New', 0, false), ('${WS1}', 'Won', 1, true)`);
});

describe("convertLeadToOpportunity — repeated conversion is rejected, not duplicated", () => {
  it("a second call on the same lead fails and leaves exactly one opportunity", async () => {
    const [lead] = (await client.query<{ id: string }>(
      `INSERT INTO leads (workspace_id, company, status) VALUES ('${WS1}', 'Acme Roofing', 'new') RETURNING id`
    )).rows;

    const first = await convertLeadToOpportunity(lead.id);
    expect(first.ok).toBe(true);

    const second = await convertLeadToOpportunity(lead.id);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/already converted/i);

    const db = (globalThis as Record<string, unknown>).__testDb as ReturnType<typeof drizzle>;
    const opps = await db.select().from(opportunities).where(eq(opportunities.leadId, lead.id));
    expect(opps).toHaveLength(1);

    const [leadRow] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(leadRow.status).toBe("converted");
  });

  it("two callers racing via Promise.all still produce exactly one opportunity", async () => {
    const [lead] = (await client.query<{ id: string }>(
      `INSERT INTO leads (workspace_id, company, status) VALUES ('${WS1}', 'Racing Roofing', 'new') RETURNING id`
    )).rows;

    const [r1, r2] = await Promise.all([convertLeadToOpportunity(lead.id), convertLeadToOpportunity(lead.id)]);
    const outcomes = [r1.ok, r2.ok];
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(outcomes.filter((ok) => !ok)).toHaveLength(1);

    const db = (globalThis as Record<string, unknown>).__testDb as ReturnType<typeof drizzle>;
    const opps = await db.select().from(opportunities).where(eq(opportunities.leadId, lead.id));
    expect(opps).toHaveLength(1);
  });
});

describe("convertOpportunityToClient — repeated conversion is rejected, not duplicated", () => {
  async function seedOpportunity() {
    const [stage] = (await client.query<{ id: string }>(`SELECT id FROM pipeline_stages WHERE workspace_id = '${WS1}' AND position = 0`)).rows;
    const [opp] = (await client.query<{ id: string }>(
      `INSERT INTO opportunities (workspace_id, stage_id, name, value, mrr) VALUES ('${WS1}', '${stage.id}', 'Acme Deal', 0, 0) RETURNING id`
    )).rows;
    return opp.id;
  }

  it("a second call on the same opportunity fails and leaves exactly one client", async () => {
    setCtx("member");
    const oppId = await seedOpportunity();
    const input = { opportunityId: oppId, clientName: "Acme Co", subscriptions: [] };

    const first = await convertOpportunityToClient(input);
    expect(first.ok).toBe(true);

    const second = await convertOpportunityToClient(input);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/already linked/i);

    const db = (globalThis as Record<string, unknown>).__testDb as ReturnType<typeof drizzle>;
    const rows = await db.select().from(clients).where(eq(clients.name, "Acme Co"));
    expect(rows).toHaveLength(1);
  });

  it("two callers racing via Promise.all still produce exactly one client", async () => {
    setCtx("member");
    const oppId = await seedOpportunity();
    const input = { opportunityId: oppId, clientName: "Racing Co", subscriptions: [] };

    const [r1, r2] = await Promise.all([convertOpportunityToClient(input), convertOpportunityToClient(input)]);
    const outcomes = [r1.ok, r2.ok];
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(outcomes.filter((ok) => !ok)).toHaveLength(1);

    const db = (globalThis as Record<string, unknown>).__testDb as ReturnType<typeof drizzle>;
    const rows = await db.select().from(clients).where(eq(clients.name, "Racing Co"));
    expect(rows).toHaveLength(1);
  });

  it("uses the workspace-local calendar date for the new client's and subscriptions' start dates", async () => {
    setCtx("member");
    const [svc] = (await client.query<{ id: string }>(
      `INSERT INTO services (workspace_id, name) VALUES ('${WS1}', 'Website Care') RETURNING id`
    )).rows;
    const oppId = await seedOpportunity();
    const result = await convertOpportunityToClient({
      opportunityId: oppId, clientName: "Dated Co",
      subscriptions: [{ serviceId: svc.id, amount: 100, frequency: "monthly" }],
    });
    expect(result.ok).toBe(true);

    const db = (globalThis as Record<string, unknown>).__testDb as ReturnType<typeof drizzle>;
    const [clientRow] = await db.select().from(clients).where(eq(clients.name, "Dated Co"));
    const subRows = await client.query<{ start_date: string }>(`SELECT start_date::text FROM subscriptions WHERE client_id = '${clientRow.id}'`);
    // Not asserting an exact date (test-run-time-dependent) — asserting
    // both dates were stamped with the SAME workspace-local value, proving
    // they share one `today` computation rather than two independent
    // `new Date()` calls that could disagree across a UTC/local boundary.
    expect(subRows.rows[0].start_date).toBe(String(clientRow.startDate));
  });
});
