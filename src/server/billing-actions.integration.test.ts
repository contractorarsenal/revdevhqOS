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

import { updateSubscription, updatePayment, voidPayment, restorePayment, deletePayment } from "@/server/actions/billing";

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
  await client.exec(`DELETE FROM subscriptions; DELETE FROM payments;`);
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
