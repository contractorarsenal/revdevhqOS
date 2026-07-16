/**
 * PGlite integration tests for CLIENT LEAD MANAGEMENT. The production query
 * builders, ownership/assignee guards, and the canonical createClientLead()
 * service are exercised against embedded Postgres. `@/lib/db` is mocked to
 * that same embedded instance so createClientLead() and logActivity() (which
 * both use the global `db`) write for real, and workspace-guards' injectable
 * `guardDeps.db` is pointed at it too.
 *
 * Prerequisite tables are minimal stubs with production column names (the
 * `leads` stub carries the full client-lead column set, including the 0016
 * additions) so the real drizzle queries run unmodified. Enum columns are
 * modelled as text since these tests don't exercise the enum ALTERs.
 *
 * Scenario coverage (numbers refer to the feature's test checklist):
 *  1 client-scoped list · 2 cross-client denial · 6 suspended excluded ·
 *  7 internal sees all · 9 manual creation appears · 10/11/12 persistence ·
 *  13 invalid assignee · 14 cross-client assignee · 15 estimated value ·
 *  16 confirmed revenue = won closed_value · 17 open leads never confirmed ·
 *  18 needs response · 19 week · 20 month · 21 avg/month · 22 tz boundary ·
 *  23 archived excluded · 24 search · 25 status · 26 source · 27 assignment ·
 *  31 internal notes hidden · 32 activity logged · 33 foreign client_id
 *  rejected · 34 workspace-scoped · 35 empty state.
 */
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";

// Route the global `db` (used by createClientLead + logActivity) at the
// embedded instance. The getter reads `holder.db`, set once in beforeAll.
const holder = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase }));
vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db;
  },
}));

import { leads, activityLogs } from "@/lib/db/schema";
import {
  listClientLeads, getClientLead, getClientLeadInternal, getClientLeadMetrics, listEligibleAssignees,
} from "@/server/queries/client-leads";
import { assertClientEligibleAssignee, assertClientOwnedLead, guardDeps } from "@/server/workspace-guards";
import { createClientLead } from "@/server/services/lead-ingestion";
import { clientLeadStatusTimestamp } from "@/lib/leads-client";

const TZ = "America/Los_Angeles";
let client: PGlite;
let db: PgliteDatabase;

const WS1 = "11111111-1111-1111-1111-111111111111";
const WS2 = "22222222-2222-2222-2222-222222222222";

const CLIENT_A = "a0000000-0000-0000-0000-000000000001";
const CLIENT_B = "b0000000-0000-0000-0000-000000000002";
const CLIENT_M = "c0000000-0000-0000-0000-000000000003"; // metrics
const CLIENT_TZ = "d0000000-0000-0000-0000-000000000004"; // timezone
const CLIENT_F = "e0000000-0000-0000-0000-000000000005"; // assignees
const CLIENT_OTHER = "f0000000-0000-0000-0000-000000000006";
const CLIENT_CREATE = "10000000-0000-0000-0000-000000000007";
const CLIENT_FILT = "10000000-0000-0000-0000-000000000008"; // search/filter/sort

const OWNER_F = "20000000-0000-0000-0000-0000000000a1";
const ASSIGNEE_1 = "20000000-0000-0000-0000-0000000000a2"; // client_member, active, CLIENT_F
const ASSIGNEE_2 = "20000000-0000-0000-0000-0000000000a3"; // client_owner, active, CLIENT_F
const RO_1 = "20000000-0000-0000-0000-0000000000a4"; // client_read_only, active, CLIENT_F
const SUS_1 = "20000000-0000-0000-0000-0000000000a5"; // client_member, SUSPENDED, CLIENT_F
const OTHER_1 = "20000000-0000-0000-0000-0000000000a6"; // client_member, active, CLIENT_OTHER
const NON_MEMBER = "20000000-0000-0000-0000-0000000000a7"; // real profile, no membership

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client);
  holder.db = db;
  // Point the guards' injectable db seam at the embedded instance. Cast for
  // the same reason workspace-guards.test.ts does: the pglite driver type
  // differs from the app's postgres-js Database type but is call-compatible.
  guardDeps.db = db as unknown as typeof guardDeps.db;

  await client.exec(`
    CREATE TABLE profiles (id uuid PRIMARY KEY, name text NOT NULL DEFAULT 'User', email text);
    CREATE TABLE client_portal_memberships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      client_id uuid NOT NULL,
      profile_id uuid NOT NULL,
      role text NOT NULL DEFAULT 'client_owner',
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE activity_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      actor_id uuid,
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_id uuid,
      client_id uuid,
      lead_id uuid,
      opportunity_id uuid,
      metadata jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
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
    INSERT INTO profiles (id, name) VALUES
      ('${OWNER_F}', 'Fiona Owner'),
      ('${ASSIGNEE_1}', 'Aaron Member'),
      ('${ASSIGNEE_2}', 'Bianca Owner'),
      ('${RO_1}', 'Rob ReadOnly'),
      ('${SUS_1}', 'Sam Suspended'),
      ('${OTHER_1}', 'Otto OtherClient'),
      ('${NON_MEMBER}', 'Nora NonMember');
    INSERT INTO client_portal_memberships (workspace_id, client_id, profile_id, role, status) VALUES
      ('${WS1}', '${CLIENT_F}', '${OWNER_F}', 'client_owner', 'active'),
      ('${WS1}', '${CLIENT_F}', '${ASSIGNEE_1}', 'client_member', 'active'),
      ('${WS1}', '${CLIENT_F}', '${ASSIGNEE_2}', 'client_owner', 'active'),
      ('${WS1}', '${CLIENT_F}', '${RO_1}', 'client_read_only', 'active'),
      ('${WS1}', '${CLIENT_F}', '${SUS_1}', 'client_member', 'suspended'),
      ('${WS1}', '${CLIENT_OTHER}', '${OTHER_1}', 'client_member', 'active');
  `);
});

afterAll(async () => {
  await client.close();
});

/* helper: insert a lead, returning its id */
async function insertLead(vals: typeof leads.$inferInsert): Promise<string> {
  const [row] = await db.insert(leads).values(vals).returning({ id: leads.id });
  return row.id;
}

describe("createClientLead — the single canonical creation path [9, 32]", () => {
  it("inserts a client-scoped lead that immediately appears in the client's portal list", async () => {
    const { id } = await createClientLead({
      workspaceId: WS1, clientId: CLIENT_CREATE,
      name: "Jane Homeowner", email: "jane@example.com", phone: "(555) 010-2000",
      requestedService: "Roof replacement", source: "Website",
      status: "new", estimatedValue: 4200, createdVia: "manual", actorId: OWNER_F,
    });
    expect(id).toBeTruthy();

    const list = await listClientLeads(db, WS1, CLIENT_CREATE);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, name: "Jane Homeowner", requestedService: "Roof replacement", source: "Website" });
    expect(list[0].estimatedValue).toBe("4200.00");
  });

  it("defaults status to 'new' and receivedAt to now when omitted", async () => {
    const { id } = await createClientLead({
      workspaceId: WS1, clientId: CLIENT_CREATE, name: "Default Guy",
      source: "Phone", createdVia: "webhook", actorId: null,
    });
    const lead = await getClientLead(db, WS1, CLIENT_CREATE, id);
    expect(lead?.status).toBe("new");
    expect(lead?.receivedAt).toBeInstanceOf(Date);
  });

  it("writes a 'lead.created' activity log entry (channel recorded, no sensitive content) [32]", async () => {
    const { id } = await createClientLead({
      workspaceId: WS1, clientId: CLIENT_CREATE, name: "Logged Lead",
      source: "Referral", createdVia: "api", actorId: OWNER_F,
    });
    const logs = await db.select().from(activityLogs).where(eq(activityLogs.leadId, id));
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("lead.created");
    expect(logs[0].entityType).toBe("lead");
    expect(logs[0].metadata).toMatchObject({ source: "Referral", via: "api", clientLead: true });
  });
});

describe("client scoping & cross-client isolation [1, 2, 33, 34]", () => {
  let leadA = "";
  let leadB = "";
  beforeAll(async () => {
    leadA = await insertLead({ workspaceId: WS1, clientId: CLIENT_A, company: "A Co", contactName: "Client A Lead", status: "new" });
    leadB = await insertLead({ workspaceId: WS1, clientId: CLIENT_B, company: "B Co", contactName: "Client B Lead", status: "new" });
  });

  it("a client only sees its own leads [1]", async () => {
    const a = await listClientLeads(db, WS1, CLIENT_A);
    expect(a.map((l) => l.id)).toContain(leadA);
    expect(a.map((l) => l.id)).not.toContain(leadB);
  });

  it("Client A cannot fetch Client B's lead — the scoped query returns nothing [2]", async () => {
    expect(await getClientLead(db, WS1, CLIENT_A, leadB)).toBeNull();
    expect(await getClientLead(db, WS1, CLIENT_B, leadB)).not.toBeNull();
  });

  it("the ownership guard rejects a foreign client's lead id — never trusting a supplied id [33]", async () => {
    await expect(assertClientOwnedLead(WS1, CLIENT_A, leadB)).rejects.toThrow(/not found/i);
    await expect(assertClientOwnedLead(WS1, CLIENT_A, leadA)).resolves.toBeUndefined();
  });

  it("queries are workspace-scoped — a real client id under the wrong workspace is empty [34]", async () => {
    const cross = await listClientLeads(db, WS2, CLIENT_A);
    expect(cross).toHaveLength(0);
    await expect(assertClientOwnedLead(WS2, CLIENT_A, leadA)).rejects.toThrow(/not found/i);
    expect((await getClientLeadMetrics(db, WS2, CLIENT_A, TZ, "2026-07-14")).totalLeads).toBe(0);
  });
});

describe("internal notes never reach the portal query [31, 7]", () => {
  it("getClientLead omits internalNotes; getClientLeadInternal includes it", async () => {
    const id = await insertLead({
      workspaceId: WS1, clientId: CLIENT_A, company: "Notes Co", contactName: "Has Notes",
      status: "contacted", notes: "client-visible note", internalNotes: "STAFF ONLY — do not expose",
    });
    const portal = await getClientLead(db, WS1, CLIENT_A, id);
    expect(portal).not.toBeNull();
    expect(portal).not.toHaveProperty("internalNotes");
    expect(portal?.notes).toBe("client-visible note");

    const internal = await getClientLeadInternal(db, WS1, CLIENT_A, id);
    expect(internal?.internalNotes).toBe("STAFF ONLY — do not expose");
  });
});

describe("eligible assignees & assignment guards [13, 14, 6, 12]", () => {
  it("lists only active owner/member portal users — excludes read-only and suspended [6]", async () => {
    const eligible = await listEligibleAssignees(db, WS1, CLIENT_F);
    const ids = eligible.map((e) => e.profileId);
    expect(ids).toContain(ASSIGNEE_1);
    expect(ids).toContain(ASSIGNEE_2);
    expect(ids).toContain(OWNER_F);
    expect(ids).not.toContain(RO_1); // read-only
    expect(ids).not.toContain(SUS_1); // suspended
    expect(ids).not.toContain(OTHER_1); // different client
  });

  it("accepts an eligible member and permits unassign (null)", async () => {
    await expect(assertClientEligibleAssignee(WS1, CLIENT_F, ASSIGNEE_1)).resolves.toBeUndefined();
    await expect(assertClientEligibleAssignee(WS1, CLIENT_F, ASSIGNEE_2)).resolves.toBeUndefined();
    await expect(assertClientEligibleAssignee(WS1, CLIENT_F, null)).resolves.toBeUndefined();
  });

  it("rejects a non-member, a read-only member, and a suspended member [13, 6]", async () => {
    await expect(assertClientEligibleAssignee(WS1, CLIENT_F, NON_MEMBER)).rejects.toThrow(/eligible/i);
    await expect(assertClientEligibleAssignee(WS1, CLIENT_F, RO_1)).rejects.toThrow(/eligible/i);
    await expect(assertClientEligibleAssignee(WS1, CLIENT_F, SUS_1)).rejects.toThrow(/eligible/i);
  });

  it("rejects a member of a DIFFERENT client [14]", async () => {
    await expect(assertClientEligibleAssignee(WS1, CLIENT_F, OTHER_1)).rejects.toThrow(/eligible/i);
  });

  it("a persisted assignment reads back through the scoped query [12]", async () => {
    const id = await insertLead({ workspaceId: WS1, clientId: CLIENT_F, company: "Assign Co", contactName: "Assign Me", status: "new" });
    await db.update(leads).set({ ownerId: ASSIGNEE_1 }).where(and(eq(leads.id, id), eq(leads.workspaceId, WS1), eq(leads.clientId, CLIENT_F)));
    const lead = await getClientLead(db, WS1, CLIENT_F, id);
    expect(lead?.assignedToId).toBe(ASSIGNEE_1);
    expect(lead?.assignedToName).toBe("Aaron Member");
  });
});

describe("persistence mirroring the server actions [10, 11]", () => {
  it("a status change persists and stamps the matching timestamp (board drag & status edit) [10, 11]", async () => {
    const id = await insertLead({ workspaceId: WS1, clientId: CLIENT_A, company: "Persist Co", contactName: "Persist", status: "new" });
    const now = new Date("2026-07-16T10:00:00Z");
    // Exactly what updateClientLeadStatus does (drag and the detail edit share it).
    await db.update(leads).set({ status: "contacted", ...clientLeadStatusTimestamp("contacted", now) })
      .where(and(eq(leads.id, id), eq(leads.workspaceId, WS1), eq(leads.clientId, CLIENT_A)));
    const lead = await getClientLead(db, WS1, CLIENT_A, id);
    expect(lead?.status).toBe("contacted");
    expect(lead?.contactedAt).toBeInstanceOf(Date);

    await db.update(leads).set({ status: "won", ...clientLeadStatusTimestamp("won", now) })
      .where(and(eq(leads.id, id), eq(leads.workspaceId, WS1), eq(leads.clientId, CLIENT_A)));
    const won = await getClientLead(db, WS1, CLIENT_A, id);
    expect(won?.status).toBe("won");
    expect(won?.wonAt).toBeInstanceOf(Date);
  });
});

describe("client lead metrics [15-23, 35]", () => {
  const TODAY = "2026-07-14"; // Tuesday → week Jul 13–19; month July

  beforeAll(async () => {
    await client.exec(`
      INSERT INTO leads (workspace_id, client_id, company, contact_name, status, estimated_value, closed_value, received_at, last_contacted_at, estimate_scheduled_at, won_at, lost_at, archived_at) VALUES
        ('${WS1}','${CLIENT_M}','M','L1 new',       'new',                500,  NULL, '2026-07-14T18:00:00Z', NULL,                   NULL,                   NULL,                   NULL, NULL),
        ('${WS1}','${CLIENT_M}','M','L2 contacted', 'contacted',          300,  NULL, '2026-07-02T18:00:00Z', '2026-07-02T19:00:00Z', NULL,                   NULL,                   NULL, NULL),
        ('${WS1}','${CLIENT_M}','M','L3 estimate',  'estimate_scheduled', 1200, NULL, '2026-07-10T18:00:00Z', '2026-07-10T18:30:00Z', '2026-07-10T19:00:00Z', NULL,                   NULL, NULL),
        ('${WS1}','${CLIENT_M}','M','L4 won',       'won',                2000, 2500, '2026-06-20T18:00:00Z', '2026-06-21T18:00:00Z', NULL,                   '2026-06-25T00:00:00Z', NULL, NULL),
        ('${WS1}','${CLIENT_M}','M','L5 lost',      'lost',               NULL, NULL, '2026-06-01T18:00:00Z', NULL,                   NULL,                   NULL,                   '2026-06-03T00:00:00Z', NULL),
        ('${WS1}','${CLIENT_M}','M','L6 archived',  'new',                999,  NULL, '2026-07-14T18:00:00Z', NULL,                   NULL,                   NULL,                   NULL, '2026-07-14T20:00:00Z'),
        ('${WS1}','${CLIENT_M}','M','L7 stray-cv',  'contacted',          100,  777,  '2026-07-08T18:00:00Z', '2026-07-08T19:00:00Z', NULL,                   NULL,                   NULL, NULL);
    `);
  });

  it("computes every operational count, excluding archived leads [18-21, 23]", async () => {
    const m = await getClientLeadMetrics(db, WS1, CLIENT_M, TZ, TODAY);
    expect(m.totalLeads).toBe(6); // archived L6 excluded
    expect(m.leadsThisWeek).toBe(1); // only L1 falls in Jul 13–19 [19]
    expect(m.leadsThisMonth).toBe(4); // L1, L2, L3, L7 [20]
    expect(m.newCount).toBe(1);
    expect(m.needsResponse).toBe(1); // L1: new AND never contacted [18]
    expect(m.contacted).toBe(2); // L2, L7
    expect(m.estimateScheduled).toBe(1); // L3
    expect(m.won).toBe(1); // L4
    expect(m.lost).toBe(1); // L5
    expect(m.avgLeadsPerMonth).toBe(3); // 6 leads across Jun–Jul (2 months) [21]
  });

  it("Estimated Pipeline Value sums OPEN leads only; Confirmed Revenue is won closed_value only [15, 16, 17]", async () => {
    const m = await getClientLeadMetrics(db, WS1, CLIENT_M, TZ, TODAY);
    // Open = new + contacted + estimate_scheduled: 500 + 300 + 1200 + 100 [15]
    expect(m.estimatedPipelineValue).toBe(2100);
    // Won closed_value only — L7's stray 777 on a *contacted* lead is NOT
    // confirmed revenue [16, 17]; only L4's 2500 counts.
    expect(m.confirmedRevenue).toBe(2500);
  });

  it("returns a clean empty state for a client with no leads [35]", async () => {
    const pristine = await getClientLeadMetrics(db, WS1, "99999999-9999-9999-9999-999999999999", TZ, TODAY);
    expect(pristine.totalLeads).toBe(0);
    expect(pristine.needsResponse).toBe(0);
    expect(pristine.estimatedPipelineValue).toBe(0);
    expect(pristine.confirmedRevenue).toBe(0);
    expect(pristine.avgLeadsPerMonth).toBe(0);
    expect(pristine.firstLeadAt).toBeNull();
  });
});

describe("timezone-correct period boundaries [22]", () => {
  beforeAll(async () => {
    // T1 is June 30 22:00 in LA (July in UTC); T2 is July 1 01:00 in LA.
    await client.exec(`
      INSERT INTO leads (workspace_id, client_id, company, contact_name, status, received_at) VALUES
        ('${WS1}','${CLIENT_TZ}','TZ','T1', 'new', '2026-07-01T05:00:00Z'),
        ('${WS1}','${CLIENT_TZ}','TZ','T2', 'new', '2026-07-01T08:00:00Z');
    `);
  });

  it("buckets by the workspace timezone, not by UTC date slicing", async () => {
    const la = await getClientLeadMetrics(db, WS1, CLIENT_TZ, TZ, "2026-07-01");
    expect(la.totalLeads).toBe(2);
    expect(la.leadsThisMonth).toBe(1); // only T2 is July in LA; T1 is still June

    const utc = await getClientLeadMetrics(db, WS1, CLIENT_TZ, "UTC", "2026-07-01");
    expect(utc.leadsThisMonth).toBe(2); // under UTC both count — proves tz matters
  });
});

describe("search, filters & sort [24, 25, 26, 27]", () => {
  beforeAll(async () => {
    await client.exec(`
      INSERT INTO leads (workspace_id, client_id, company, contact_name, email, phone, source, status, estimated_value, owner_id, received_at) VALUES
        ('${WS1}','${CLIENT_FILT}','F','Alice Johnson','alice@example.com','555-0001','Website', 'new',       100, NULL,          '2026-07-01T10:00:00Z'),
        ('${WS1}','${CLIENT_FILT}','F','Bob Smith',    'bob@example.com',  '555-0002','Referral','contacted', 900, '${ASSIGNEE_1}','2026-07-05T10:00:00Z'),
        ('${WS1}','${CLIENT_FILT}','F','Carol White',  'carol@example.com','555-0003','Website', 'won',       50,  '${ASSIGNEE_2}','2026-07-03T10:00:00Z');
    `);
  });

  it("searches name, email, and phone [24]", async () => {
    expect((await listClientLeads(db, WS1, CLIENT_FILT, { search: "alice" })).map((l) => l.name)).toEqual(["Alice Johnson"]);
    expect((await listClientLeads(db, WS1, CLIENT_FILT, { search: "bob@example" })).map((l) => l.name)).toEqual(["Bob Smith"]);
    expect((await listClientLeads(db, WS1, CLIENT_FILT, { search: "555-0003" })).map((l) => l.name)).toEqual(["Carol White"]);
  });

  it("filters by status [25]", async () => {
    const news = await listClientLeads(db, WS1, CLIENT_FILT, { status: "new" });
    expect(news.map((l) => l.name)).toEqual(["Alice Johnson"]);
  });

  it("filters by source [26]", async () => {
    const web = await listClientLeads(db, WS1, CLIENT_FILT, { source: "Website" });
    expect(web.map((l) => l.name).sort()).toEqual(["Alice Johnson", "Carol White"]);
  });

  it("filters by assignment, including unassigned [27]", async () => {
    expect((await listClientLeads(db, WS1, CLIENT_FILT, { assignedTo: ASSIGNEE_1 })).map((l) => l.name)).toEqual(["Bob Smith"]);
    const unassigned = await listClientLeads(db, WS1, CLIENT_FILT, { assignedTo: "unassigned" });
    expect(unassigned.map((l) => l.name)).toContain("Alice Johnson");
    expect(unassigned.map((l) => l.name)).not.toContain("Bob Smith");
  });

  it("sorts newest (default), oldest, and highest estimated value", async () => {
    const newest = await listClientLeads(db, WS1, CLIENT_FILT, {});
    expect(newest.map((l) => l.name)).toEqual(["Bob Smith", "Carol White", "Alice Johnson"]); // by receivedAt desc
    const oldest = await listClientLeads(db, WS1, CLIENT_FILT, { sort: "oldest" });
    expect(oldest[0].name).toBe("Alice Johnson");
    const byValue = await listClientLeads(db, WS1, CLIENT_FILT, { sort: "highest_value" });
    expect(byValue[0].name).toBe("Bob Smith"); // 900 is highest
  });
});
