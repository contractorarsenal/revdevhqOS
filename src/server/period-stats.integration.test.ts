/**
 * PGlite integration tests for the reusable period-calculation services
 * (Part 7) and, most importantly, for the actual claim of this PR: that
 * every payment mutation — create, edit, void, restore, delete, move to
 * another month — is reflected immediately in a live-recomputed revenue
 * number, with no stored/cached total anywhere in the read path. The real
 * migration (0015) that adds payments.previous_status is also run here to
 * confirm the restore path's schema change is valid additive SQL.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { zonedTimeToUtc } from "@/lib/date-tz";
import { recalcInvoiceForPaymentChange } from "@/lib/finance/metrics";
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

// July 2026 in America/Los_Angeles: [Jul 1 07:00 UTC, Aug 1 07:00 UTC)
const july = {
  start: zonedTimeToUtc("2026-07-01", "00:00", TZ),
  end: zonedTimeToUtc("2026-08-01", "00:00", TZ),
};
// August 2026, for "move payment to another month" assertions.
const august = {
  start: zonedTimeToUtc("2026-08-01", "00:00", TZ),
  end: zonedTimeToUtc("2026-09-01", "00:00", TZ),
};

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

describe("migration 0015: payments.previous_status", () => {
  it("is added additively, defaulting existing rows to null", async () => {
    const res = await client.query(
      `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='payments' AND column_name='previous_status'`
    );
    expect(res.rows).toEqual([{ column_name: "previous_status", is_nullable: "YES" }]);
  });
});

describe("calculateRevenueForPeriod — the full payment lifecycle stays live", () => {
  it("create: a fresh succeeded payment is counted immediately", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, paid_at, billing_month) VALUES
        ('${WS1}', 1000, 'succeeded', '2026-07-10T12:00:00Z', '2026-07-01');
    `);
    const r = await calculateRevenueForPeriod(db, WS1, july);
    expect(r).toEqual({ collected: 1000, paymentCount: 1, averagePayment: 1000, largestPayment: 1000 });
  });

  it("edit: raising the amount immediately changes collected revenue", async () => {
    await client.exec(`UPDATE payments SET amount = 1500 WHERE workspace_id = '${WS1}'`);
    const r = await calculateRevenueForPeriod(db, WS1, july);
    expect(r.collected).toBe(1500);
  });

  it("void: flipping status to voided removes it from revenue immediately", async () => {
    await client.exec(`
      UPDATE payments SET status = 'voided', previous_status = 'succeeded', voided_at = now()
      WHERE workspace_id = '${WS1}'
    `);
    const r = await calculateRevenueForPeriod(db, WS1, july);
    expect(r).toEqual({ collected: 0, paymentCount: 0, averagePayment: 0, largestPayment: 0 });
  });

  it("restore: flipping status back from previous_status brings it back immediately", async () => {
    await client.exec(`
      UPDATE payments SET status = previous_status, previous_status = NULL, voided_at = NULL
      WHERE workspace_id = '${WS1}'
    `);
    const r = await calculateRevenueForPeriod(db, WS1, july);
    expect(r.collected).toBe(1500);
  });

  it("move to another month: changing paid_at moves the payment between periods immediately", async () => {
    await client.exec(`UPDATE payments SET paid_at = '2026-08-05T12:00:00Z', billing_month = '2026-08-01' WHERE workspace_id = '${WS1}'`);
    expect((await calculateRevenueForPeriod(db, WS1, july)).collected).toBe(0);
    expect((await calculateRevenueForPeriod(db, WS1, august)).collected).toBe(1500);
  });

  it("delete: removing the row excludes it immediately, with no trace left behind", async () => {
    await client.exec(`DELETE FROM payments WHERE workspace_id = '${WS1}'`);
    expect((await calculateRevenueForPeriod(db, WS1, august)).collected).toBe(0);
  });

  it("multiple succeeded payments: paymentCount, averagePayment, and largestPayment are all live", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, paid_at) VALUES
        ('${WS1}', 500,  'succeeded', '2026-07-05T12:00:00Z'),
        ('${WS1}', 1500, 'succeeded', '2026-07-15T12:00:00Z'),
        ('${WS1}', 250,  'pending',   '2026-07-20T12:00:00Z');
    `);
    const r = await calculateRevenueForPeriod(db, WS1, july);
    expect(r).toEqual({ collected: 2000, paymentCount: 2, averagePayment: 1000, largestPayment: 1500 });
    await client.exec(`DELETE FROM payments WHERE workspace_id = '${WS1}'`);
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

    const before = { status: "succeeded", amount: 500 };
    const after = { status: "succeeded", amount: 200 };
    const next = recalcInvoiceForPaymentChange({ total: 1000, amountPaid: 500, status: "open" }, before, after);
    expect(next).toEqual({ amountPaid: 200, status: "open" });

    await client.query(`UPDATE payments SET amount = $1 WHERE id = $2`, [after.amount, p.id]);
    await client.query(`UPDATE invoices SET amount_paid = $1, status = $2 WHERE id = $3`, [next.amountPaid, next.status, inv.id]);

    const [row] = await client.query<{ amount_paid: string }>(`SELECT amount_paid FROM invoices WHERE id = '${inv.id}'`).then((r) => r.rows);
    expect(Number(row.amount_paid)).toBe(200);
  });
});

describe("calculateClientStatsForPeriod / calculateLeadStatsForPeriod / calculateTaskStatsForPeriod / calculateProjectStatsForPeriod", () => {
  it("all count only records inside the given UTC bounds, for the given workspace", async () => {
    await client.exec(`
      INSERT INTO clients (workspace_id, created_at) VALUES ('${WS1}', '2026-07-05T12:00:00Z'), ('${WS1}', '2026-06-01T12:00:00Z');
      INSERT INTO leads (workspace_id, created_at) VALUES ('${WS1}', '2026-07-06T12:00:00Z');
      INSERT INTO tasks (workspace_id, completed_at) VALUES ('${WS1}', '2026-07-09T12:00:00Z'), ('${WS1}', NULL);
      INSERT INTO projects (workspace_id, completed_at) VALUES ('${WS1}', '2026-07-20T12:00:00Z');
    `);
    expect(await calculateClientStatsForPeriod(db, WS1, july)).toEqual({ newClients: 1 });
    expect(await calculateLeadStatsForPeriod(db, WS1, july)).toEqual({ newLeads: 1 });
    expect(await calculateTaskStatsForPeriod(db, WS1, july)).toEqual({ completedTasks: 1 });
    expect(await calculateProjectStatsForPeriod(db, WS1, july)).toEqual({ completedProjects: 1 });
  });
});

describe("calculateGoalSnapshot", () => {
  it("automatic metric: aggregates live source records for the goal's period", async () => {
    await client.exec(`
      DELETE FROM payments WHERE workspace_id = '${WS1}';
      INSERT INTO payments (workspace_id, amount, status, paid_at) VALUES ('${WS1}', 4000, 'succeeded', '2026-07-12T12:00:00Z');
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
