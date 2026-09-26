/**
 * Bulk payments through the REAL server actions on an embedded Postgres with
 * the real migrations (so the partial unique index and FK behaviour are the
 * production ones). Proves: multi-row save, per-row failure isolation, hard
 * and soft duplicate protection, subscription/invoice linkage, activity per
 * payment, cross-workspace rejection, and role enforcement.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

const revalidatePath = vi.fn();
const logActivity = vi.fn(async () => {});
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/server/activity", () => ({ logActivity: (...a: unknown[]) => (logActivity as (...x: unknown[]) => unknown)(...a) }));
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

import { previewBulkPayments, submitBulkPayments } from "@/server/actions/bulk-payments";

function data<T>(r: { ok: boolean; data?: T }): T {
  if (!r.ok || !r.data) throw new Error("expected ok result");
  return r.data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const s: Record<string, string> = {};
const USER = "55555555-5555-4555-8555-555555555555";

function setRole(role: string) {
  (globalThis as Record<string, unknown>).__testCtx = {
    workspace: { id: s.ws, timezone: "America/Los_Angeles" }, user: { id: USER, name: "T" }, role,
  };
}
let n = 0;
const row = (over: Record<string, unknown>) => ({
  rowId: `r${++n}`, clientId: s.a, subscriptionId: null, invoiceId: null, amount: 100,
  paidAt: "2026-06-10", method: "check", reference: null, note: null, billingMonth: null, ...over,
});

beforeAll(async () => {
  const pg = new PGlite();
  db = drizzle(pg, { schema });
  (globalThis as Record<string, unknown>).__testDb = db;
  for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await pg.exec(stmt);
    }
  }
  const [ws] = await db.insert(schema.workspaces).values({ name: "WS", slug: "ws" }).returning();
  const [ws2] = await db.insert(schema.workspaces).values({ name: "WS2", slug: "ws2" }).returning();
  const [a] = await db.insert(schema.clients).values({ workspaceId: ws.id, name: "Client A" }).returning();
  const [b] = await db.insert(schema.clients).values({ workspaceId: ws.id, name: "Client B" }).returning();
  const [x] = await db.insert(schema.clients).values({ workspaceId: ws2.id, name: "Foreign" }).returning();
  const [svc] = await db.insert(schema.services).values({ workspaceId: ws.id, name: "SEO" }).returning();
  const [sub] = await db.insert(schema.subscriptions).values({ workspaceId: ws.id, clientId: a.id, serviceId: svc.id, amount: "300", startDate: "2026-01-01" }).returning();
  const [inv] = await db.insert(schema.invoices).values({ workspaceId: ws.id, clientId: b.id, number: "B-1", status: "open", total: "200" }).returning();
  Object.assign(s, { ws: ws.id, a: a.id, b: b.id, x: x.id, sub: sub.id, inv: inv.id });
});

beforeEach(() => { setRole("admin"); logActivity.mockClear(); });

describe("bulk payments", () => {
  it("saves multiple valid rows, one activity entry each, and reports the total", async () => {
    const res = await submitBulkPayments({ rows: [
      row({ amount: 111, paidAt: "2026-05-01" }),
      row({ clientId: s.b, amount: 222, paidAt: "2026-05-02", method: "zelle" }),
    ], confirmedDuplicateRowIds: [] });
    expect(data(res).savedCount).toBe(2);
    expect(data(res).savedTotal).toBe(333);
    expect(logActivity).toHaveBeenCalledTimes(2);
    expect(logActivity.mock.calls[0]).toBeDefined();
  });

  it("one bad row does not roll back the good ones (cross-workspace client)", async () => {
    const good = row({ amount: 12.34, paidAt: "2026-04-01" });
    const bad = row({ clientId: s.x, amount: 5, paidAt: "2026-04-01" });
    const res = await submitBulkPayments({ rows: [good, bad], confirmedDuplicateRowIds: [] });
    const results = data(res).results;
    expect(results.find((r) => r.rowId === good.rowId)?.ok).toBe(true);
    expect(results.find((r) => r.rowId === bad.rowId)?.ok).toBe(false);
    const saved = await db.select().from(schema.payments).where(eq(schema.payments.clientId, s.x));
    expect(saved).toHaveLength(0);
  });

  it("subscription month duplicates are hard-blocked (existing and within batch)", async () => {
    const first = await submitBulkPayments({ rows: [row({ subscriptionId: s.sub, amount: 300, paidAt: "2026-03-05" })], confirmedDuplicateRowIds: [] });
    expect(data(first).savedCount).toBe(1);
    const again = row({ subscriptionId: s.sub, amount: 300, paidAt: "2026-03-20" });
    const prev = await previewBulkPayments({ rows: [again] });
    expect(data(prev).rows[0].blocked).toBe(true);
    const res = await submitBulkPayments({ rows: [again], confirmedDuplicateRowIds: [again.rowId] });
    expect(data(res).savedCount).toBe(0);

    const r1 = row({ subscriptionId: s.sub, amount: 300, paidAt: "2026-02-05" });
    const r2 = row({ subscriptionId: s.sub, amount: 300, paidAt: "2026-02-06" });
    const inBatch = await submitBulkPayments({ rows: [r1, r2], confirmedDuplicateRowIds: [] });
    expect(data(inBatch).savedCount).toBe(1);
  });

  it("soft duplicate (same client/amount/date) needs explicit confirmation", async () => {
    await submitBulkPayments({ rows: [row({ amount: 77, paidAt: "2026-01-15" })], confirmedDuplicateRowIds: [] });
    const dup = row({ amount: 77, paidAt: "2026-01-15" });
    const unconfirmed = await submitBulkPayments({ rows: [dup], confirmedDuplicateRowIds: [] });
    expect(data(unconfirmed).savedCount).toBe(0);
    const confirmed = await submitBulkPayments({ rows: [dup], confirmedDuplicateRowIds: [dup.rowId] });
    expect(data(confirmed).savedCount).toBe(1);
  });

  it("rejects subscription/invoice belonging to another client and both-at-once", async () => {
    const wrongClient = row({ clientId: s.b, subscriptionId: s.sub });
    const both = row({ invoiceId: s.inv, subscriptionId: s.sub });
    const prev = await previewBulkPayments({ rows: [wrongClient, both] });
    expect(data(prev).rows.every((r) => r.blocked)).toBe(true);
  });

  it("invoice payments go through the shared payment path and update the invoice", async () => {
    const res = await submitBulkPayments({ rows: [row({ clientId: s.b, invoiceId: s.inv, amount: 200, paidAt: "2026-06-01" })], confirmedDuplicateRowIds: [] });
    expect(data(res).savedCount).toBe(1);
    const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, s.inv));
    expect(Number(inv.amountPaid)).toBe(200);
    expect(inv.status).toBe("paid");
  });

  it("requires manager or above and validates the batch", async () => {
    setRole("member");
    const denied = await submitBulkPayments({ rows: [row({})], confirmedDuplicateRowIds: [] });
    expect(denied.ok).toBe(false);
    setRole("admin");
    expect((await submitBulkPayments({ rows: [], confirmedDuplicateRowIds: [] })).ok).toBe(false);
    expect((await submitBulkPayments({ rows: [row({ amount: -5 })], confirmedDuplicateRowIds: [] })).ok).toBe(false);
  });
});
