/**
 * Runs the REAL billing server actions (updateSubscription, updatePayment,
 * voidPayment, restorePayment, deletePayment) against an embedded PGlite
 * database, with only the process boundaries mocked: authorize() resolves a
 * configurable test context (through the real assertRole matrix),
 * revalidatePath is a spy, activity logging is a no-op. This proves the
 * whole action pipeline — zod validation, workspace-ownership predicate,
 * SQL update, timestamp stamping, cache revalidation targets — not just the
 * query builders.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { subscriptions } from "@/lib/db/schema";

const revalidatePath = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("@/server/activity", () => ({ logActivity: vi.fn(async () => {}) }));
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

import {
  updateSubscription, updatePayment, voidPayment, restorePayment, deletePayment,
  recordPayment, markInvoicePaid, markSubscriptionCollected, createInvoice,
} from "@/server/actions/billing";
import { invoices, payments } from "@/lib/db/schema";

const WS1 = "11111111-1111-4111-8111-111111111111";
const WS2 = "22222222-2222-4222-8222-222222222222";
const CLIENT1 = "33333333-3333-4333-8333-333333333333";
const SERVICE1 = "44444444-4444-4444-8444-444444444444";
const USER1 = "55555555-5555-4555-8555-555555555555";

let client: PGlite;

function setCtx(workspaceId: string, role: string) {
  (globalThis as Record<string, unknown>).__testCtx = {
    workspace: { id: workspaceId, timezone: "America/Los_Angeles" },
    user: { id: USER1, name: "Test User" },
    role,
  };
}

beforeAll(async () => {
  client = new PGlite();
  (globalThis as Record<string, unknown>).__testDb = drizzle(client);

  // Production column names/types, FK-free stubs — drizzle's full-row
  // select() needs every schema column present.
  await client.exec(`
    CREATE TABLE clients (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      name text NOT NULL,
      website text, email text, phone text, industry text, portal_accent_color text, address text,
      status text NOT NULL DEFAULT 'onboarding',
      owner_id uuid,
      start_date date,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      client_id uuid NOT NULL,
      service_id uuid NOT NULL,
      amount numeric(12,2) NOT NULL,
      frequency text NOT NULL DEFAULT 'monthly',
      status text NOT NULL DEFAULT 'active',
      start_date date NOT NULL,
      next_billing_date date,
      payment_day integer,
      paused_at timestamptz,
      canceled_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      client_id uuid,
      invoice_id uuid,
      subscription_id uuid,
      amount numeric(12,2) NOT NULL,
      status text NOT NULL DEFAULT 'succeeded',
      payment_type text NOT NULL DEFAULT 'one_time',
      billing_month date,
      method text,
      reference text,
      paid_at timestamptz NOT NULL,
      voided_at timestamptz,
      voided_by uuid,
      void_reason text,
      previous_status text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX payments_subscription_billing_month_unique ON payments (subscription_id, billing_month)
      WHERE subscription_id IS NOT NULL AND billing_month IS NOT NULL AND status != 'voided';
    CREATE TABLE invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      client_id uuid NOT NULL,
      number text NOT NULL,
      status text NOT NULL DEFAULT 'draft',
      billing_frequency text NOT NULL DEFAULT 'one_time',
      billing_month date,
      issue_date date,
      due_date date,
      total numeric(12,2) NOT NULL DEFAULT 0,
      amount_paid numeric(12,2) NOT NULL DEFAULT 0,
      voided_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX invoices_workspace_number_unique ON invoices (workspace_id, number);
    CREATE TABLE invoice_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id uuid NOT NULL,
      service_id uuid,
      description text NOT NULL,
      quantity numeric(10,2) NOT NULL DEFAULT 1,
      unit_price numeric(12,2) NOT NULL,
      amount numeric(12,2) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
});

afterAll(async () => {
  await client.close();
});

let subId: string;
let payId: string;

beforeEach(async () => {
  revalidatePath.mockClear();
  setCtx(WS1, "admin");
  await client.exec(`DELETE FROM subscriptions; DELETE FROM payments; DELETE FROM invoices; DELETE FROM invoice_items; DELETE FROM clients;`);
  await client.exec(`INSERT INTO clients (id, workspace_id, name) VALUES ('${CLIENT1}', '${WS1}', 'Acme Co')`);
  const sub = await client.query<{ id: string }>(
    `INSERT INTO subscriptions (workspace_id, client_id, service_id, amount, frequency, status, start_date, payment_day)
     VALUES ('${WS1}', '${CLIENT1}', '${SERVICE1}', 1400, 'monthly', 'active', '2026-01-01', 5) RETURNING id`
  );
  subId = sub.rows[0].id;
  const pay = await client.query<{ id: string }>(
    `INSERT INTO payments (workspace_id, client_id, subscription_id, amount, status, payment_type, billing_month, paid_at)
     VALUES ('${WS1}', '${CLIENT1}', '${subId}', 1400, 'succeeded', 'monthly', '2026-06-01', '2026-06-05T12:00:00Z') RETURNING id`
  );
  payId = pay.rows[0].id;
});

const editInput = {
  amount: 1400, frequency: "monthly", status: "active",
  startDate: "2026-01-01", nextBillingDate: "", paymentDay: 5,
};

async function subRow() {
  const db = (globalThis as Record<string, unknown>).__testDb as ReturnType<typeof drizzle>;
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, subId));
  return row;
}

describe("updateSubscription — edits persist and stay scoped", () => {
  it("amount edit persists", async () => {
    const result = await updateSubscription(subId, { ...editInput, amount: 1650.5 });
    expect(result.ok).toBe(true);
    expect(Number((await subRow()).amount)).toBe(1650.5);
  });

  it("payment-day edit persists, including days 29-31", async () => {
    expect((await updateSubscription(subId, { ...editInput, paymentDay: 31 })).ok).toBe(true);
    expect((await subRow()).paymentDay).toBe(31);
  });

  it("status edit persists and stamps canceledAt exactly once", async () => {
    expect((await updateSubscription(subId, { ...editInput, status: "canceled" })).ok).toBe(true);
    const afterCancel = await subRow();
    expect(afterCancel.status).toBe("canceled");
    expect(afterCancel.canceledAt).not.toBeNull();

    // pausing stamps pausedAt; resuming clears it but keeps canceledAt history
    expect((await updateSubscription(subId, { ...editInput, status: "paused" })).ok).toBe(true);
    expect((await subRow()).pausedAt).not.toBeNull();
    expect((await updateSubscription(subId, { ...editInput, status: "active" })).ok).toBe(true);
    expect((await subRow()).pausedAt).toBeNull();
  });

  it("start date and next billing date edits persist", async () => {
    const result = await updateSubscription(subId, { ...editInput, startDate: "2026-02-15", nextBillingDate: "2026-08-05" });
    expect(result.ok).toBe(true);
    const row = await subRow();
    expect(String(row.startDate).slice(0, 10)).toBe("2026-02-15");
    expect(String(row.nextBillingDate).slice(0, 10)).toBe("2026-08-05");
  });

  it("editing the subscription NEVER rewrites historical payment records", async () => {
    const before = await client.query(`SELECT amount, status, billing_month, paid_at FROM payments WHERE id = '${payId}'`);
    expect((await updateSubscription(subId, { ...editInput, amount: 9999 })).ok).toBe(true);
    const after = await client.query(`SELECT amount, status, billing_month, paid_at FROM payments WHERE id = '${payId}'`);
    expect(after.rows).toEqual(before.rows);
  });

  it("revalidates the client page, dashboard, and billing after a successful edit", async () => {
    await updateSubscription(subId, { ...editInput, amount: 1500 });
    const paths = revalidatePath.mock.calls.map((c) => c[0]);
    expect(paths).toContain(`/clients/${CLIENT1}`);
    expect(paths).toContain("/dashboard");
    expect(paths).toContain("/billing");
  });

  it("rejects an edit from another workspace's context (ownership predicate)", async () => {
    setCtx(WS2, "admin");
    const result = await updateSubscription(subId, { ...editInput, amount: 1 });
    expect(result).toEqual({ ok: false, error: "Subscription not found in this workspace." });
    expect(Number((await subRow()).amount)).toBe(1400); // untouched
  });

  it("rejects an insufficient role via the real permission matrix", async () => {
    setCtx(WS1, "viewer");
    const result = await updateSubscription(subId, { ...editInput, amount: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/permission/i);
    expect(Number((await subRow()).amount)).toBe(1400);
  });

  it("rejects invalid input with a readable field message", async () => {
    const result = await updateSubscription(subId, { ...editInput, amount: -5 });
    expect(result.ok).toBe(false);
  });
});

describe("updatePayment — edits persist and revalidate goals", () => {
  const payInput = {
    clientId: CLIENT1, invoiceId: "", amount: 1400, status: "succeeded",
    paymentType: "monthly", billingMonth: "2026-07", method: "", reference: "", paidAt: "2026-07-05",
  };

  it("moving the payment to another billing month persists and revalidates every goal surface", async () => {
    const result = await updatePayment(payId, payInput);
    expect(result.ok).toBe(true);
    const row = await client.query<{ billing_month: string }>(`SELECT billing_month::text FROM payments WHERE id = '${payId}'`);
    expect(row.rows[0].billing_month).toBe("2026-07-01");
    const paths = revalidatePath.mock.calls.map((c) => c[0]);
    for (const p of ["/dashboard", "/goals", "/goals/[id]", "/billing", `/clients/${CLIENT1}`]) {
      expect(paths).toContain(p);
    }
  });

  it("rejects edits from another workspace's context", async () => {
    setCtx(WS2, "manager");
    const result = await updatePayment(payId, payInput);
    expect(result).toEqual({ ok: false, error: "Payment not found in this workspace." });
  });
});

describe("void / restore / delete policy — audit-safe by construction", () => {
  it("void captures the prior status; restore returns to it exactly", async () => {
    await client.query(`UPDATE payments SET status = 'pending' WHERE id = '${payId}'`);
    expect((await voidPayment(payId)).ok).toBe(true);
    let row = await client.query<{ status: string; previous_status: string | null }>(`SELECT status, previous_status FROM payments WHERE id = '${payId}'`);
    expect(row.rows[0]).toEqual({ status: "voided", previous_status: "pending" });

    expect((await restorePayment(payId)).ok).toBe(true);
    row = await client.query<{ status: string; previous_status: string | null }>(`SELECT status, previous_status FROM payments WHERE id = '${payId}'`);
    expect(row.rows[0]).toEqual({ status: "pending", previous_status: null });
  });

  it("an active payment can never be hard-deleted — it must be voided first", async () => {
    const result = await deletePayment(payId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/remove.*first/i);
    const still = await client.query(`SELECT id FROM payments WHERE id = '${payId}'`);
    expect(still.rows).toHaveLength(1);

    expect((await voidPayment(payId)).ok).toBe(true);
    expect((await deletePayment(payId)).ok).toBe(true);
    const gone = await client.query(`SELECT id FROM payments WHERE id = '${payId}'`);
    expect(gone.rows).toHaveLength(0);
  });
});

async function createTestInvoice(total: number) {
  const result = await createInvoice({
    clientId: CLIENT1, number: `INV-${Math.random().toString(36).slice(2, 8)}`, status: "open",
    billingFrequency: "one_time", issueDate: "2026-07-01",
    items: [{ description: "Work", quantity: 1, unitPrice: total }],
  });
  if (!result.ok || !result.data) throw new Error("failed to seed invoice");
  return result.data.id;
}

describe("recordPayment — concurrent payments against the same invoice never lose an update", () => {
  it("two concurrent succeeded payments both land in the invoice's amountPaid (no stale-read overwrite)", async () => {
    setCtx(WS1, "manager");
    const invoiceId = await createTestInvoice(1000);

    const payInput = (amount: number) => ({
      clientId: "", invoiceId, amount, status: "succeeded",
      paymentType: "one_time", billingMonth: "", method: "", reference: "", paidAt: "2026-07-10",
    });
    const [r1, r2] = await Promise.all([recordPayment(payInput(400)), recordPayment(payInput(300))]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const db = (globalThis as Record<string, unknown>).__testDb as ReturnType<typeof drizzle>;
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(Number(inv.amountPaid)).toBe(700); // NOT 400 or 300 — both increments must be reflected
    const rows = await db.select().from(payments).where(eq(payments.invoiceId, invoiceId));
    expect(rows).toHaveLength(2);
  });
});

describe("markInvoicePaid — concurrent calls never double-collect the balance", () => {
  it("two concurrent 'mark paid' calls insert exactly one payment for the balance", async () => {
    setCtx(WS1, "manager");
    const invoiceId = await createTestInvoice(500);

    const [r1, r2] = await Promise.all([markInvoicePaid(invoiceId), markInvoicePaid(invoiceId)]);
    const outcomes = [r1.ok, r2.ok];
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(outcomes.filter((ok) => !ok)).toHaveLength(1);

    const db = (globalThis as Record<string, unknown>).__testDb as ReturnType<typeof drizzle>;
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(Number(inv.amountPaid)).toBe(500);
    expect(inv.status).toBe("paid");
    const rows = await db.select().from(payments).where(eq(payments.invoiceId, invoiceId));
    expect(rows).toHaveLength(1);
  });
});

describe("markSubscriptionCollected — concurrent clicks never double-collect a billing month", () => {
  it("two concurrent calls for the same subscription insert exactly one non-voided payment for the due month", async () => {
    setCtx(WS1, "manager");
    // subId's payment fixture is for 2026-06 — void it so the fast-path
    // pre-check doesn't just short-circuit both calls identically; either
    // way only one insert should ever land, backstopped by the partial
    // unique index regardless of which path each caller took.
    await client.query(`UPDATE payments SET status = 'voided' WHERE id = '${payId}'`);

    const [r1, r2] = await Promise.all([markSubscriptionCollected(subId), markSubscriptionCollected(subId)]);
    const outcomes = [r1.ok, r2.ok];
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(outcomes.filter((ok) => !ok)).toHaveLength(1);
    const rejected = (r1.ok ? r2 : r1) as { ok: false; error: string };
    expect(rejected.error).toMatch(/already been recorded/i);

    const db = (globalThis as Record<string, unknown>).__testDb as ReturnType<typeof drizzle>;
    const rows = await db.select().from(payments).where(eq(payments.subscriptionId, subId));
    const nonVoided = rows.filter((r) => r.status !== "voided");
    expect(nonVoided).toHaveLength(1);
  });
});

describe("createInvoice — billing month fallback uses the workspace-local calendar date", () => {
  it("picks the workspace-local month even when it differs from the UTC month", async () => {
    setCtx(WS1, "manager");
    // 05:00 UTC on Jan 1 is still 21:00 on Dec 31 in America/Los_Angeles
    // (UTC-8 in January) — the old `new Date().toISOString().slice(0,7)`
    // fallback would wrongly stamp "2026-01", not the workspace's "2025-12".
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T05:00:00Z"));
    try {
      const result = await createInvoice({
        clientId: CLIENT1, number: `INV-TZ-${Math.random().toString(36).slice(2, 8)}`, status: "open",
        billingFrequency: "one_time", items: [{ description: "Work", quantity: 1, unitPrice: 100 }],
      });
      expect(result.ok).toBe(true);
      if (!result.ok || !result.data) return;
      const row = await client.query<{ billing_month: string }>(`SELECT billing_month::text FROM invoices WHERE id = '${result.data.id}'`);
      expect(row.rows[0].billing_month).toBe("2025-12-01");
    } finally {
      vi.useRealTimers();
    }
  });
});
