/**
 * ingestClientLead against embedded Postgres: keys are required on the
 * first insert, a replay is a duplicate, and non-CA clients insert nothing.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq, sql } from "drizzle-orm";
import { clientLeads } from "@/lib/db/schema";
import { clientLeadReceivedLabel, formatInTimezone, toDateOnlyString } from "@/lib/date-tz";
import { INGEST_CLIENT_LEAD_ERROR, TRADER_U_CLIENT_ID } from "@/lib/client-lead-ingest";

const revalidatePath = vi.fn();
const logActivity = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/server/activity", () => ({ logActivity: (...args: unknown[]) => logActivity(...args) }));
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, {
    get(_t, prop) {
      const target = (globalThis as Record<string, unknown>).__ingestTestDb as Record<string, unknown>;
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
      const ctx = (globalThis as Record<string, unknown>).__ingestTestCtx as { role: Parameters<typeof assertRole>[0] };
      assertRole(ctx.role, minRole);
      return ctx;
    },
  };
});

import { ingestClientLead } from "@/server/actions/client-lead-ingest";

const WS1 = "11111111-1111-4111-8111-111111111111";
const WS2 = "22222222-2222-4222-8222-222222222222";
const USER1 = "55555555-5555-4555-8555-555555555555";
const HIGHLINE = "891cd47a-17ad-447d-982b-7d0bb1052b66";
const GOLDEN_OAK = "9678ac62-8d7c-42f9-ad44-33012a3874cd";
const YOUNG_BUCKS = "227b11d2-6034-4d13-9641-1603e0acf3e2";
const ELITE = "64aba590-8476-4547-a2fd-23682ddc8fc7";
const JC_GRADING = "894560bf-4913-41e1-af90-09e1eb1fd281";
const UNMAPPED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CRYPTO_OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let client: PGlite;

function setCtx(role: string) {
  (globalThis as Record<string, unknown>).__ingestTestCtx = {
    workspace: { id: WS1, timezone: "America/Los_Angeles" },
    user: { id: USER1, name: "Test User" },
    role,
  };
}

function leadCount() {
  const db = (globalThis as Record<string, unknown>).__ingestTestDb as ReturnType<typeof drizzle>;
  return db.select({ n: sql<string>`count(*)` }).from(clientLeads).then((rows) => Number(rows[0].n));
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    clientId: HIGHLINE,
    name: "Jane Homeowner",
    email: "jane@example.com",
    phone: "(555) 010-2000",
    requestedService: "Roof replacement",
    source: "Website",
    receivedOn: "2026-09-22",
    externalMessageId: "gmail-msg-jane-1",
    dedupeKey: "gmail:jane-1",
    ingestionSource: "gmail",
    ...overrides,
  };
}

beforeAll(async () => {
  client = new PGlite();
  const db = drizzle(client);
  (globalThis as Record<string, unknown>).__ingestTestDb = db;

  await client.exec(`
    CREATE TABLE clients (
      id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL,
      name text NOT NULL,
      industry text,
      status text NOT NULL DEFAULT 'active',
      archived_at timestamptz
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
    INSERT INTO clients (id, workspace_id, name, industry, status) VALUES
      ('${HIGHLINE}', '${WS1}', 'Highline Roofing', 'Roofing', 'active'),
      ('${GOLDEN_OAK}', '${WS1}', 'Golden Oak', NULL, 'active'),
      ('${YOUNG_BUCKS}', '${WS1}', 'Young Bucks', NULL, 'paused'),
      ('${TRADER_U_CLIENT_ID}', '${WS1}', 'Trader U', 'Crypto Community', 'active'),
      ('${UNMAPPED}', '${WS1}', 'Some Other Co', 'Roofing', 'active'),
      ('${CRYPTO_OTHER}', '${WS1}', 'Other Crypto', 'Crypto Community', 'active'),
      ('${JC_GRADING}', '${WS2}', 'JC Grading', 'Grading', 'active');
    INSERT INTO clients (id, workspace_id, name, industry, status, archived_at) VALUES
      ('${ELITE}', '${WS1}', 'Elite Bathrooms', 'Bathrooms', 'active', now());
  `);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  revalidatePath.mockClear();
  logActivity.mockClear();
  setCtx("admin");
  await client.exec(`DELETE FROM client_leads;`);
});

describe("ingestClientLead", () => {
  it("inserts one row with both keys, then a replay is a duplicate and still one row", async () => {
    const first = await ingestClientLead(payload());
    const second = await ingestClientLead(payload({ name: "Jane Edited" }));
    expect(first).toMatchObject({ ok: true, data: { duplicate: false } });
    expect(second).toMatchObject({ ok: true, data: { duplicate: true, id: first.ok ? first.data?.id : "" } });
    expect(await leadCount()).toBe(1);

    const db = (globalThis as Record<string, unknown>).__ingestTestDb as ReturnType<typeof drizzle>;
    const [row] = await db.select().from(clientLeads).where(and(
      eq(clientLeads.workspaceId, WS1),
      eq(clientLeads.externalMessageId, "gmail-msg-jane-1"),
    ));
    expect(row.name).toBe("Jane Homeowner");
    expect(row.dedupeKey).toBe("gmail:jane-1");
    expect(row.externalMessageId).toBe("gmail-msg-jane-1");
    expect(row.ingestionSource).toBe("gmail");
    expect(logActivity).toHaveBeenCalledTimes(1);
  });

  it("treats the same dedupeKey with a new externalMessageId as a duplicate", async () => {
    const first = await ingestClientLead(payload());
    const second = await ingestClientLead(payload({ externalMessageId: "gmail-msg-jane-2" }));
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.data).toEqual({ id: first.data?.id, duplicate: true });
    expect(await leadCount()).toBe(1);
    const db = (globalThis as Record<string, unknown>).__ingestTestDb as ReturnType<typeof drizzle>;
    const [row] = await db.select().from(clientLeads);
    expect(row.externalMessageId).toBe("gmail-msg-jane-1");
    expect(row.dedupeKey).toBe("gmail:jane-1");
  });

  it("rejects a missing externalMessageId or dedupeKey and inserts nothing", async () => {
    const missingExternal = await ingestClientLead(payload({ externalMessageId: undefined }));
    const missingDedupe = await ingestClientLead(payload({ dedupeKey: "   " }));
    expect(missingExternal).toMatchObject({ ok: false, code: INGEST_CLIENT_LEAD_ERROR.MISSING_FIELDS });
    expect(missingDedupe).toMatchObject({ ok: false, code: INGEST_CLIENT_LEAD_ERROR.MISSING_FIELDS });
    expect(await leadCount()).toBe(0);
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("rejects Trader U and other non-CA clients and inserts nothing", async () => {
    const trader = await ingestClientLead(payload({
      clientId: TRADER_U_CLIENT_ID,
      externalMessageId: "gmail-trader",
      dedupeKey: "gmail:trader",
    }));
    const cryptoIndustry = await ingestClientLead(payload({
      clientId: CRYPTO_OTHER,
      externalMessageId: "gmail-crypto",
      dedupeKey: "gmail:crypto",
    }));
    const unmapped = await ingestClientLead(payload({
      clientId: UNMAPPED,
      externalMessageId: "gmail-unmapped",
      dedupeKey: "gmail:unmapped",
    }));
    expect(trader).toMatchObject({ ok: false, code: INGEST_CLIENT_LEAD_ERROR.NOT_CA_CLIENT });
    expect(cryptoIndustry).toMatchObject({ ok: false, code: INGEST_CLIENT_LEAD_ERROR.NOT_CA_CLIENT });
    expect(unmapped).toMatchObject({ ok: false, code: INGEST_CLIENT_LEAD_ERROR.UNMAPPED });
    expect(await leadCount()).toBe(0);
  });

  it("rejects an inactive, archived, or other-workspace client", async () => {
    const paused = await ingestClientLead(payload({ clientId: YOUNG_BUCKS, externalMessageId: "p", dedupeKey: "p" }));
    const archived = await ingestClientLead(payload({ clientId: ELITE, externalMessageId: "a", dedupeKey: "a" }));
    const otherWs = await ingestClientLead(payload({ clientId: JC_GRADING, externalMessageId: "w", dedupeKey: "w" }));
    expect(paused).toMatchObject({ ok: false, code: INGEST_CLIENT_LEAD_ERROR.INVALID_CLIENT });
    expect(archived).toMatchObject({ ok: false, code: INGEST_CLIENT_LEAD_ERROR.INVALID_CLIENT });
    expect(otherWs).toMatchObject({ ok: false, code: INGEST_CLIENT_LEAD_ERROR.INVALID_CLIENT });
    expect(await leadCount()).toBe(0);
  });

  it("stores receivedOn as the calendar day when UTC midnight is still the previous Pacific day", async () => {
    expect(formatInTimezone(new Date("2026-09-22"), "America/Los_Angeles").date).toBe("2026-09-21");
    const result = await ingestClientLead(payload({ receivedOn: "2026-09-22" }));
    expect(result.ok).toBe(true);
    const { rows } = await client.query<{ received_on: string; received_at: string }>(
      `SELECT received_on::text AS received_on, received_at::text AS received_at FROM client_leads`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].received_on).toBe("2026-09-22");
    expect(rows[0].received_on).not.toBe("2026-09-21");
    expect(rows[0].received_at.startsWith("2026-09-22 00:00:00")).toBe(false);

    const db = (globalThis as Record<string, unknown>).__ingestTestDb as ReturnType<typeof drizzle>;
    const [row] = await db.select().from(clientLeads);
    expect(toDateOnlyString(row.receivedOn)).toBe("2026-09-22");
    expect(clientLeadReceivedLabel(row.receivedOn, row.receivedAt)).toBe("Sep 22, 2026");
  });

  it("rejects an impossible calendar date and inserts nothing", async () => {
    const result = await ingestClientLead(payload({ receivedOn: "2026-02-31" }));
    expect(result).toMatchObject({ ok: false, code: INGEST_CLIENT_LEAD_ERROR.INVALID_DATE });
    expect(await leadCount()).toBe(0);
  });

  it("ingests an allowlisted client with no industry", async () => {
    const result = await ingestClientLead(payload({
      clientId: GOLDEN_OAK,
      externalMessageId: "gmail-oak",
      dedupeKey: "gmail:oak",
    }));
    expect(result).toMatchObject({ ok: true, data: { duplicate: false } });
    expect(await leadCount()).toBe(1);
  });

  it("requires admin", async () => {
    setCtx("member");
    const result = await ingestClientLead(payload());
    expect(result).toMatchObject({ ok: false, code: INGEST_CLIENT_LEAD_ERROR.FORBIDDEN });
    expect(await leadCount()).toBe(0);
  });
});
