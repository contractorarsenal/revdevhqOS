/**
 * PGlite integration tests for the reusable period-calculation services
 * (Part 7) and for the authoritative revenue-attribution rule: succeeded
 * payments only, attributed to billing_month when set (recurring/invoice
 * intent), else to the workspace-local date of paid_at — one period per
 * payment, never double-counted, identical across Goals and Reports by
 * construction. The real migration (0015) that adds
 * payments.previous_status also runs here to prove the restore path's
 * schema change is valid additive SQL.
 */
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { paymentBelongsToPeriod, recalcInvoiceForPaymentChange } from "@/lib/finance/metrics";
import { metricValueInPeriod } from "@/server/queries/goal-metrics";
import {
  calculateRevenueForPeriod, calculateClientStatsForPeriod, calculateLeadStatsForPeriod,
  calculateTaskStatsForPeriod, calculateProjectStatsForPeriod, calculateGoalSnapshot,
} from "@/server/queries/period-stats";

const TZ = "America/Los_Angeles";
let client: PGlite;
let db: PgliteDatabase;

const WS1 = "11111111-1111-1111-1111-111111111111";

async function runMigrationFile(file: string) {
  const sqlText = readFileSync(join(process.cwd(), "drizzle", file), "utf8");
  for (const stmt of sqlText.split("--> statement-breakpoint")) {
    const trimmed = stmt.trim();
    if (trimmed) await client.exec(trimmed);
  }
}

const june = { start: "2026-06-01", end: "2026-06-30" };
const july = { start: "2026-07-01", end: "2026-07-31" };
const august = { start: "2026-08-01", end: "2026-08-31" };

async function julyRevenue() {
  return (await calculateRevenueForPeriod(db, WS1, july, TZ)).collected;
}

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client);

  await client.exec(`
    CREATE TYPE payment_status AS ENUM('pending', 'succeeded', 'failed', 'refunded');
    ALTER TYPE payment_status ADD VALUE 'voided';
    CREATE TABLE workspaces (id uuid PRIMARY KEY);
    CREATE TABLE invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      total numeric(12,2) NOT NULL,
      amount_paid numeric(12,2) NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'open'
    );
    CREATE TABLE payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      invoice_id uuid,
      amount numeric(12,2) NOT NULL,
      status payment_status NOT NULL DEFAULT 'succeeded',
      payment_type text NOT NULL DEFAULT 'one_time',
      billing_month date,
      paid_at timestamptz NOT NULL,
      voided_at timestamptz,
      void_reason text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE clients (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      completed_at timestamptz
    );
    CREATE TABLE projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      completed_at timestamptz
    );
    INSERT INTO workspaces (id) VALUES ('${WS1}');
  `);

  await runMigrationFile("0015_payment_previous_status.sql");
});

afterAll(async () => {
  await client.close();
});

afterEach(async () => {
  await client.exec(`DELETE FROM payments; DELETE FROM invoices;`);
});

describe("migration 0015: payments.previous_status", () => {
  it("is added additively, defaulting existing rows to null", async () => {
    const res = await client.query(
      `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='payments' AND column_name='previous_status'`
    );
    expect(res.rows).toEqual([{ column_name: "previous_status", is_nullable: "YES" }]);
  });
});

describe("authoritative revenue attribution — billing_month first, workspace-local paid_at fallback", () => {
  it("a July goal EXCLUDES revenue with a June billing month, even when collected in July", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, payment_type, billing_month, paid_at) VALUES
        ('${WS1}', 1000, 'succeeded', 'monthly', '2026-06-01', '2026-07-02T18:00:00Z');
    `);
    expect(await julyRevenue()).toBe(0);
    expect((await calculateRevenueForPeriod(db, WS1, june, TZ)).collected).toBe(1000);
  });

  it("a July goal INCLUDES a succeeded recurring payment FOR July even when collected in August", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, payment_type, billing_month, paid_at) VALUES
        ('${WS1}', 750, 'succeeded', 'monthly', '2026-07-01', '2026-08-02T18:00:00Z');
    `);
    expect(await julyRevenue()).toBe(750);
    expect((await calculateRevenueForPeriod(db, WS1, august, TZ)).collected).toBe(0);
  });

  it("a one-time payment without a billing month counts on its workspace-local collection date", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, payment_type, billing_month, paid_at) VALUES
        ('${WS1}', 400, 'succeeded', 'one_time', NULL, '2026-07-10T12:00:00Z');
    `);
    expect(await julyRevenue()).toBe(400);
  });

  it("workspace-timezone midnight boundary decides the month for billing-month-less payments — never UTC slicing", async () => {
    // 06:59 UTC on Jul 1 is still June 30 in Los Angeles; 07:00 is July 1.
    // The same instants at the August boundary mirror it.
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, billing_month, paid_at) VALUES
        ('${WS1}', 100, 'succeeded', NULL, '2026-07-01T06:59:59Z'),
        ('${WS1}', 200, 'succeeded', NULL, '2026-07-01T07:00:00Z'),
        ('${WS1}', 300, 'succeeded', NULL, '2026-08-01T06:59:59Z'),
        ('${WS1}', 400, 'succeeded', NULL, '2026-08-01T07:00:00Z');
    `);
    expect(await julyRevenue()).toBe(500); // 200 + 300
    expect((await calculateRevenueForPeriod(db, WS1, june, TZ)).collected).toBe(100);
    expect((await calculateRevenueForPeriod(db, WS1, august, TZ)).collected).toBe(400);
  });

  it("voided and refunded payments never count, whatever their billing month", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, billing_month, paid_at) VALUES
        ('${WS1}', 999, 'voided',   '2026-07-01', '2026-07-05T12:00:00Z'),
        ('${WS1}', 888, 'refunded', '2026-07-01', '2026-07-06T12:00:00Z'),
        ('${WS1}', 777, 'pending',  '2026-07-01', '2026-07-07T12:00:00Z'),
        ('${WS1}', 666, 'failed',   '2026-07-01', '2026-07-08T12:00:00Z');
    `);
    expect(await julyRevenue()).toBe(0);
  });

  it("a restored payment (voided → succeeded) counts again immediately", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, previous_status, billing_month, paid_at) VALUES
        ('${WS1}', 550, 'voided', 'succeeded', '2026-07-01', '2026-07-05T12:00:00Z');
    `);
    expect(await julyRevenue()).toBe(0);
    await client.exec(`UPDATE payments SET status = previous_status, previous_status = NULL WHERE workspace_id = '${WS1}'`);
    expect(await julyRevenue()).toBe(550);
  });

  it("moving a payment between billing months moves it between goal periods", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, billing_month, paid_at) VALUES
        ('${WS1}', 1200, 'succeeded', '2026-06-01', '2026-06-20T12:00:00Z');
    `);
    expect((await calculateRevenueForPeriod(db, WS1, june, TZ)).collected).toBe(1200);
    expect(await julyRevenue()).toBe(0);
    await client.exec(`UPDATE payments SET billing_month = '2026-07-01' WHERE workspace_id = '${WS1}'`);
    expect((await calculateRevenueForPeriod(db, WS1, june, TZ)).collected).toBe(0);
    expect(await julyRevenue()).toBe(1200);
  });

  it("a payment is never double-counted: June billing month + July collection = exactly one period", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, billing_month, paid_at) VALUES
        ('${WS1}', 500, 'succeeded', '2026-06-01', '2026-07-02T18:00:00Z');
    `);
    const total =
      (await calculateRevenueForPeriod(db, WS1, june, TZ)).collected +
      (await calculateRevenueForPeriod(db, WS1, july, TZ)).collected +
      (await calculateRevenueForPeriod(db, WS1, august, TZ)).collected;
    expect(total).toBe(500);
  });

  it("Goals (metricValueInPeriod) and Reports (calculateRevenueForPeriod) compute the identical number", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, billing_month, paid_at) VALUES
        ('${WS1}', 1000, 'succeeded', '2026-07-01', '2026-08-02T18:00:00Z'),
        ('${WS1}', 250,  'succeeded', NULL,         '2026-07-10T12:00:00Z'),
        ('${WS1}', 999,  'voided',    '2026-07-01', '2026-07-11T12:00:00Z'),
        ('${WS1}', 400,  'succeeded', '2026-06-01', '2026-07-03T12:00:00Z');
    `);
    const goalValue = await metricValueInPeriod(db, WS1, "revenue_collected", july, TZ);
    const reportValue = (await calculateRevenueForPeriod(db, WS1, july, TZ)).collected;
    expect(goalValue).toBe(1250); // 1000 (July bm) + 250 (July local paid date)
    expect(reportValue).toBe(goalValue);
  });

  it("the SQL filter agrees with the pure TS rule (paymentBelongsToPeriod) payment-by-payment", async () => {
    const fixtures = [
      { amount: "10", status: "succeeded", billing_month: "'2026-07-01'", paid_at: "2026-09-15T12:00:00Z" },
      { amount: "20", status: "succeeded", billing_month: "'2026-06-01'", paid_at: "2026-07-15T12:00:00Z" },
      { amount: "30", status: "succeeded", billing_month: "NULL", paid_at: "2026-07-01T06:59:59Z" },
      { amount: "40", status: "succeeded", billing_month: "NULL", paid_at: "2026-07-01T07:00:00Z" },
      { amount: "50", status: "pending", billing_month: "'2026-07-01'", paid_at: "2026-07-10T12:00:00Z" },
      { amount: "60", status: "voided", billing_month: "NULL", paid_at: "2026-07-10T12:00:00Z" },
    ];
    for (const f of fixtures) {
      await client.exec(
        `INSERT INTO payments (workspace_id, amount, status, billing_month, paid_at)
         VALUES ('${WS1}', ${f.amount}, '${f.status}', ${f.billing_month}, '${f.paid_at}')`
      );
    }
    const sqlTotal = await julyRevenue();
    const tsTotal = fixtures
      .filter((f) =>
        paymentBelongsToPeriod(
          {
            status: f.status,
            billingMonth: f.billing_month === "NULL" ? null : f.billing_month.replaceAll("'", ""),
            paidAt: new Date(f.paid_at),
          },
          july,
          TZ
        )
      )
      .reduce((sum, f) => sum + Number(f.amount), 0);
    expect(sqlTotal).toBe(tsTotal);
    expect(sqlTotal).toBe(50); // 10 (July bm) + 40 (July local date)
  });
});

describe("calculateRevenueForPeriod — payment lifecycle stays live", () => {
  it("create → edit → void → restore → delete each immediately change the period total", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, billing_month, paid_at) VALUES
        ('${WS1}', 1000, 'succeeded', '2026-07-01', '2026-07-10T12:00:00Z');
    `);
    expect(await julyRevenue()).toBe(1000);

    await client.exec(`UPDATE payments SET amount = 1500 WHERE workspace_id = '${WS1}'`);
    expect(await julyRevenue()).toBe(1500);

    await client.exec(`UPDATE payments SET status = 'voided', previous_status = 'succeeded' WHERE workspace_id = '${WS1}'`);
    expect(await julyRevenue()).toBe(0);

    await client.exec(`UPDATE payments SET status = previous_status, previous_status = NULL WHERE workspace_id = '${WS1}'`);
    expect(await julyRevenue()).toBe(1500);

    await client.exec(`DELETE FROM payments WHERE workspace_id = '${WS1}'`);
    expect(await julyRevenue()).toBe(0);
  });

  it("paymentCount, averagePayment, and largestPayment are all live and succeeded-only", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, billing_month, paid_at) VALUES
        ('${WS1}', 500,  'succeeded', '2026-07-01', '2026-07-05T12:00:00Z'),
        ('${WS1}', 1500, 'succeeded', '2026-07-01', '2026-07-15T12:00:00Z'),
        ('${WS1}', 250,  'pending',   '2026-07-01', '2026-07-20T12:00:00Z');
    `);
    const r = await calculateRevenueForPeriod(db, WS1, july, TZ);
    expect(r).toEqual({ collected: 2000, paymentCount: 2, averagePayment: 1000, largestPayment: 1500 });
  });
});

describe("recalcInvoiceForPaymentChange applied against a real linked invoice row", () => {
  it("editing a payment's amount down updates the invoice's amount_paid exactly once", async () => {
    const [inv] = await client
      .query<{ id: string }>(`INSERT INTO invoices (workspace_id, total, amount_paid, status) VALUES ('${WS1}', 1000, 500, 'open') RETURNING id`)
      .then((r) => r.rows);
    const [p] = await client
      .query<{ id: string }>(`INSERT INTO payments (workspace_id, invoice_id, amount, status, paid_at) VALUES ('${WS1}', '${inv.id}', 500, 'succeeded', '2026-07-10T12:00:00Z') RETURNING id`)
      .then((r) => r.rows);

    const next = recalcInvoiceForPaymentChange(
      { total: 1000, amountPaid: 500, status: "open" },
      { status: "succeeded", amount: 500 },
      { status: "succeeded", amount: 200 }
    );
    expect(next).toEqual({ amountPaid: 200, status: "open" });

    await client.query(`UPDATE payments SET amount = $1 WHERE id = $2`, [200, p.id]);
    await client.query(`UPDATE invoices SET amount_paid = $1, status = $2 WHERE id = $3`, [next.amountPaid, next.status, inv.id]);

    const [row] = await client.query<{ amount_paid: string }>(`SELECT amount_paid FROM invoices WHERE id = '${inv.id}'`).then((r) => r.rows);
    expect(Number(row.amount_paid)).toBe(200);
  });
});

describe("count metrics for a period", () => {
  it("clients/leads/tasks/projects count only records inside the workspace-local period", async () => {
    await client.exec(`
      INSERT INTO clients (workspace_id, created_at) VALUES ('${WS1}', '2026-07-05T12:00:00Z'), ('${WS1}', '2026-06-01T12:00:00Z');
      INSERT INTO leads (workspace_id, created_at) VALUES ('${WS1}', '2026-07-06T12:00:00Z');
      INSERT INTO tasks (workspace_id, completed_at) VALUES ('${WS1}', '2026-07-09T12:00:00Z'), ('${WS1}', NULL);
      INSERT INTO projects (workspace_id, completed_at) VALUES ('${WS1}', '2026-07-20T12:00:00Z');
    `);
    expect(await calculateClientStatsForPeriod(db, WS1, july, TZ)).toEqual({ newClients: 1 });
    expect(await calculateLeadStatsForPeriod(db, WS1, july, TZ)).toEqual({ newLeads: 1 });
    expect(await calculateTaskStatsForPeriod(db, WS1, july, TZ)).toEqual({ completedTasks: 1 });
    expect(await calculateProjectStatsForPeriod(db, WS1, july, TZ)).toEqual({ completedProjects: 1 });
  });
});

describe("calculateGoalSnapshot", () => {
  it("automatic metric: aggregates live source records with billing-month attribution", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, billing_month, paid_at) VALUES
        ('${WS1}', 4000, 'succeeded', '2026-07-01', '2026-08-02T12:00:00Z');
    `);
    const snapshot = await calculateGoalSnapshot(db, WS1, TZ, {
      metricType: "revenue_collected",
      targetValue: 10000,
      manualCurrentValue: null,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
    });
    expect(snapshot.current).toBe(4000);
    expect(snapshot.progressPct).toBeCloseTo(40, 5);
  });

  it("manual metric: reads the stored value and never queries source tables", async () => {
    const snapshot = await calculateGoalSnapshot(db, WS1, TZ, {
      metricType: "calls_completed",
      targetValue: 100,
      manualCurrentValue: 42,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
    });
    expect(snapshot.current).toBe(42);
    expect(snapshot.progressPct).toBeCloseTo(42, 5);
  });
});

describe("live date progression — time moves the goal without any mutation", () => {
  const goal = {
    metricType: "calls_completed" as const,
    targetValue: 100,
    manualCurrentValue: 10,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("days remaining shrinks from one request to the next when only the clock changes", async () => {
    // Only Date is faked — PGlite's async machinery keeps real timers.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-07-14T20:00:00Z") }); // Jul 14, 1 PM in LA
    const day1 = await calculateGoalSnapshot(db, WS1, TZ, goal);
    expect(day1.elapsedDays).toBe(14);
    expect(day1.remainingDays).toBe(17);

    vi.setSystemTime(new Date("2026-07-15T20:00:00Z")); // next afternoon
    const day2 = await calculateGoalSnapshot(db, WS1, TZ, goal);
    expect(day2.elapsedDays).toBe(15);
    expect(day2.remainingDays).toBe(16);
  });

  it("crossing workspace-local midnight (not UTC midnight) is the moment the numbers move", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-07-15T06:59:00Z") }); // still Jul 14 in LA
    const before = await calculateGoalSnapshot(db, WS1, TZ, goal);
    vi.setSystemTime(new Date("2026-07-15T07:01:00Z")); // two minutes later: Jul 15 in LA
    const after = await calculateGoalSnapshot(db, WS1, TZ, goal);
    expect(before.remainingDays).toBe(17);
    expect(after.remainingDays).toBe(16);
    expect(before.expectedValue).toBeLessThan(after.expectedValue);
  });

  it("a goal period ending yesterday flips to 'ended' at the workspace-local month rollover", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-08-01T06:59:00Z") }); // Jul 31 in LA
    const lastDay = await calculateGoalSnapshot(db, WS1, TZ, goal);
    vi.setSystemTime(new Date("2026-08-01T07:01:00Z")); // Aug 1 in LA
    const ended = await calculateGoalSnapshot(db, WS1, TZ, goal);
    expect(lastDay.periodState).toBe("active");
    expect(ended.periodState).toBe("ended");
  });
});
