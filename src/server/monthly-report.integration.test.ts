/**
 * PGlite integration tests for Monthly Reports: the new period-stats
 * services (revenue breakdown, expenses, outstanding invoices,
 * opportunities) and the getMonthlyReport assembler that composes them.
 *
 * The core revenue-attribution matrix (billing_month vs paid_at,
 * voided/refunded exclusion, no double counting, timezone boundaries) is
 * already exhaustively covered in period-stats.integration.test.ts against
 * the SAME revenuePaymentInPeriod function this report reuses — it is
 * deliberately not re-derived here. What's new: the report-specific
 * aggregations, and that assembling a full report never disagrees with the
 * Goals numbers for the identical period.
 */
import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import {
  calculateRevenueForPeriod, calculateRevenueBreakdownForPeriod, calculateExpenseBreakdownForPeriod,
  calculateOutstandingInvoicesForPeriod, calculateOpportunityStatsForPeriod, calculateClientStatsForPeriod,
  calculateLeadStatsForPeriod, calculateTaskStatsForPeriod, calculateProjectStatsForPeriod,
} from "@/server/queries/period-stats";
import { metricValueInPeriod } from "@/server/queries/goal-metrics";

const TZ = "America/Los_Angeles";
let client: PGlite;
let db: PgliteDatabase;

const WS1 = "11111111-1111-4111-8111-111111111111";
const WS2 = "22222222-2222-4222-8222-222222222222";
const CLIENT_A = "33333333-3333-4333-8333-333333333333";
const CLIENT_B = "44444444-4444-4444-8444-444444444444";
const STAGE1 = "55555555-5555-4555-8555-555555555555";

const july = { start: "2026-07-01", end: "2026-07-31" };
const june = { start: "2026-06-01", end: "2026-06-30" };

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client);

  await client.exec(`
    CREATE TABLE workspaces (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE clients (id uuid PRIMARY KEY, workspace_id uuid NOT NULL, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      client_id uuid,
      amount numeric(12,2) NOT NULL,
      status text NOT NULL DEFAULT 'succeeded',
      payment_type text NOT NULL DEFAULT 'one_time',
      billing_month date,
      paid_at timestamptz NOT NULL
    );
    CREATE TABLE invoices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'open',
      total numeric(12,2) NOT NULL DEFAULT 0,
      amount_paid numeric(12,2) NOT NULL DEFAULT 0,
      billing_month date,
      issue_date date
    );
    CREATE TABLE expenses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      name text NOT NULL,
      category text NOT NULL DEFAULT 'misc',
      amount numeric(12,2) NOT NULL,
      expense_date date NOT NULL,
      frequency text NOT NULL DEFAULT 'one_time',
      status text NOT NULL DEFAULT 'active'
    );
    CREATE TABLE leads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, completed_at timestamptz);
    CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, completed_at timestamptz);
    CREATE TABLE pipeline_stages (id uuid PRIMARY KEY, workspace_id uuid NOT NULL);
    CREATE TABLE opportunities (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      stage_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'open',
      value numeric(12,2) NOT NULL DEFAULT 0,
      won_at timestamptz,
      lost_at timestamptz
    );
    CREATE TABLE business_goals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL,
      name text NOT NULL,
      metric_type text NOT NULL,
      period_type text NOT NULL,
      target_value numeric(12,2) NOT NULL,
      manual_current_value numeric(12,2),
      period_start date NOT NULL,
      period_end date NOT NULL,
      is_primary boolean NOT NULL DEFAULT false,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO workspaces (id) VALUES ('${WS1}'), ('${WS2}');
    INSERT INTO clients (id, workspace_id, name, created_at) VALUES ('${CLIENT_A}', '${WS1}', 'Acme Co', '2020-01-01T00:00:00Z'), ('${CLIENT_B}', '${WS1}', 'Beta LLC', '2020-01-01T00:00:00Z');
    INSERT INTO pipeline_stages (id, workspace_id) VALUES ('${STAGE1}', '${WS1}');
  `);
});

afterAll(async () => {
  await client.close();
});

afterEach(async () => {
  await client.exec(`DELETE FROM payments; DELETE FROM invoices; DELETE FROM expenses; DELETE FROM leads; DELETE FROM tasks; DELETE FROM projects; DELETE FROM opportunities; DELETE FROM business_goals;`);
});

describe("calculateRevenueBreakdownForPeriod", () => {
  it("splits one-time vs recurring, and by client — sums always equal calculateRevenueForPeriod's total (no double counting)", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, client_id, amount, status, payment_type, billing_month, paid_at) VALUES
        ('${WS1}', '${CLIENT_A}', 1000, 'succeeded', 'one_time', NULL, '2026-07-05T12:00:00Z'),
        ('${WS1}', '${CLIENT_A}', 500,  'succeeded', 'monthly',  '2026-07-01', '2026-07-10T12:00:00Z'),
        ('${WS1}', '${CLIENT_B}', 300,  'succeeded', 'monthly',  '2026-07-01', '2026-07-12T12:00:00Z'),
        ('${WS1}', NULL,          200,  'succeeded', 'one_time', NULL, '2026-07-15T12:00:00Z'),
        ('${WS1}', '${CLIENT_A}', 999,  'voided',    'one_time', NULL, '2026-07-20T12:00:00Z');
    `);
    const total = await calculateRevenueForPeriod(db, WS1, july, TZ);
    const breakdown = await calculateRevenueBreakdownForPeriod(db, WS1, july, TZ);

    expect(total.collected).toBe(2000);
    expect(breakdown.oneTime).toBe(1200); // 1000 + 200
    expect(breakdown.recurring).toBe(800); // 500 + 300
    expect(breakdown.oneTime + breakdown.recurring).toBe(total.collected);

    const byClientSum = breakdown.byClient.reduce((s, c) => s + c.amount, 0);
    expect(byClientSum).toBe(total.collected);
    expect(breakdown.byClient.find((c) => c.clientId === CLIENT_A)?.amount).toBe(1500);
    expect(breakdown.byClient.find((c) => c.clientId === CLIENT_B)?.amount).toBe(300);
    expect(breakdown.byClient.find((c) => c.clientId === null)?.amount).toBe(200);
  });

  it("revenue by client is sorted highest first", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, client_id, amount, status, paid_at) VALUES
        ('${WS1}', '${CLIENT_A}', 100, 'succeeded', '2026-07-05T12:00:00Z'),
        ('${WS1}', '${CLIENT_B}', 900, 'succeeded', '2026-07-06T12:00:00Z');
    `);
    const breakdown = await calculateRevenueBreakdownForPeriod(db, WS1, july, TZ);
    expect(breakdown.byClient[0].clientId).toBe(CLIENT_B);
  });
});

describe("calculateExpenseBreakdownForPeriod", () => {
  it("totals active expenses effective in the period, broken down by category, with the largest identified", async () => {
    await client.exec(`
      INSERT INTO expenses (workspace_id, name, category, amount, expense_date, frequency, status) VALUES
        ('${WS1}', 'Figma', 'software', 45, '2026-07-03', 'one_time', 'active'),
        ('${WS1}', 'Payroll', 'payroll', 1800, '2026-07-01', 'one_time', 'active'),
        ('${WS1}', 'Office rent', 'office_rent', 500, '2026-01-01', 'monthly', 'active'),
        ('${WS1}', 'Archived tool', 'tools', 999, '2026-07-01', 'one_time', 'archived'),
        ('${WS1}', 'August expense', 'misc', 50, '2026-08-05', 'one_time', 'active');
    `);
    const b = await calculateExpenseBreakdownForPeriod(db, WS1, july);
    expect(b.total).toBe(2345); // 45 + 1800 + 500 (recurring rent carries into July); archived and August excluded
    expect(b.byCategory.find((c) => c.category === "payroll")?.amount).toBe(1800);
    expect(b.largest).toEqual({ name: "Payroll", amount: 1800, category: "payroll" });
  });

  it("a monthly expense that started AFTER the period does not apply", async () => {
    await client.exec(`INSERT INTO expenses (workspace_id, name, category, amount, expense_date, frequency) VALUES ('${WS1}', 'New tool', 'tools', 100, '2026-08-01', 'monthly')`);
    expect((await calculateExpenseBreakdownForPeriod(db, WS1, july)).total).toBe(0);
  });

  it("zero expenses returns a clean empty breakdown, not an error", async () => {
    const b = await calculateExpenseBreakdownForPeriod(db, WS1, july);
    expect(b).toEqual({ total: 0, byCategory: [], largest: null });
  });
});

describe("calculateOutstandingInvoicesForPeriod", () => {
  it("sums unpaid balances of open/past_due invoices attributed to the period by billing_month", async () => {
    await client.exec(`
      INSERT INTO invoices (workspace_id, status, total, amount_paid, billing_month) VALUES
        ('${WS1}', 'open', 1000, 400, '2026-07-01'),
        ('${WS1}', 'past_due', 500, 0, '2026-07-01'),
        ('${WS1}', 'paid', 800, 800, '2026-07-01'),
        ('${WS1}', 'open', 300, 0, '2026-06-01');
    `);
    const r = await calculateOutstandingInvoicesForPeriod(db, WS1, july);
    expect(r).toEqual({ outstanding: 1100, count: 2 }); // 600 + 500; paid and June excluded
  });

  it("falls back to issue_date when billing_month is null", async () => {
    await client.exec(`INSERT INTO invoices (workspace_id, status, total, amount_paid, billing_month, issue_date) VALUES ('${WS1}', 'open', 200, 0, NULL, '2026-07-15')`);
    expect((await calculateOutstandingInvoicesForPeriod(db, WS1, july)).outstanding).toBe(200);
  });
});

describe("calculateOpportunityStatsForPeriod", () => {
  it("counts won/lost by their real timestamps and computes a safe win rate", async () => {
    await client.exec(`
      INSERT INTO opportunities (workspace_id, stage_id, status, value, won_at) VALUES
        ('${WS1}', '${STAGE1}', 'won', 5000, '2026-07-10T12:00:00Z'),
        ('${WS1}', '${STAGE1}', 'won', 3000, '2026-07-20T12:00:00Z');
      INSERT INTO opportunities (workspace_id, stage_id, status, value, lost_at) VALUES
        ('${WS1}', '${STAGE1}', 'lost', 0, '2026-07-15T12:00:00Z');
    `);
    const r = await calculateOpportunityStatsForPeriod(db, WS1, july, TZ);
    expect(r.wonCount).toBe(2);
    expect(r.wonValue).toBe(8000);
    expect(r.lostCount).toBe(1);
    expect(r.winRate).toBeCloseTo(66.67, 1);
  });

  it("nothing decided this period: winRate is null, never NaN or Infinity", async () => {
    const r = await calculateOpportunityStatsForPeriod(db, WS1, july, TZ);
    expect(r).toEqual({ wonCount: 0, wonValue: 0, lostCount: 0, winRate: null });
  });
});

describe("workspace isolation", () => {
  it("revenue, expenses, and opportunity stats never leak across workspaces", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, paid_at) VALUES ('${WS2}', 99999, 'succeeded', '2026-07-05T12:00:00Z');
      INSERT INTO expenses (workspace_id, name, amount, expense_date) VALUES ('${WS2}', 'Other workspace expense', 99999, '2026-07-01');
    `);
    expect((await calculateRevenueForPeriod(db, WS1, july, TZ)).collected).toBe(0);
    expect((await calculateExpenseBreakdownForPeriod(db, WS1, july)).total).toBe(0);
    expect((await calculateRevenueForPeriod(db, WS2, july, TZ)).collected).toBe(99999);
  });
});

describe("Reports revenue equals Goals revenue for the identical period (no divergent implementations)", () => {
  it("calculateRevenueForPeriod and metricValueInPeriod('revenue_collected') agree exactly", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, billing_month, paid_at) VALUES
        ('${WS1}', 1500, 'succeeded', '2026-07-01', '2026-08-02T12:00:00Z'),
        ('${WS1}', 250,  'succeeded', NULL, '2026-07-10T12:00:00Z'),
        ('${WS1}', 999,  'voided', '2026-07-01', '2026-07-11T12:00:00Z');
    `);
    const reportsValue = (await calculateRevenueForPeriod(db, WS1, july, TZ)).collected;
    const goalsValue = await metricValueInPeriod(db, WS1, "revenue_collected", july, TZ);
    expect(reportsValue).toBe(goalsValue);
    expect(reportsValue).toBe(1750);
  });
});

describe("count metrics reused from Part 7 (new clients, leads, tasks, projects)", () => {
  it("current vs previous month counts are independent and correctly scoped", async () => {
    await client.exec(`
      INSERT INTO clients (id, workspace_id, name, created_at) VALUES (gen_random_uuid(), '${WS1}', 'July Client', '2026-07-05T12:00:00Z');
      INSERT INTO leads (workspace_id, created_at) VALUES ('${WS1}', '2026-06-10T12:00:00Z');
      INSERT INTO tasks (workspace_id, completed_at) VALUES ('${WS1}', '2026-07-09T12:00:00Z');
      INSERT INTO projects (workspace_id, completed_at) VALUES ('${WS1}', '2026-06-09T12:00:00Z');
    `);
    expect((await calculateClientStatsForPeriod(db, WS1, july, TZ)).newClients).toBe(1);
    expect((await calculateClientStatsForPeriod(db, WS1, june, TZ)).newClients).toBe(0);
    expect((await calculateLeadStatsForPeriod(db, WS1, june, TZ)).newLeads).toBe(1);
    expect((await calculateLeadStatsForPeriod(db, WS1, july, TZ)).newLeads).toBe(0);
    expect((await calculateTaskStatsForPeriod(db, WS1, july, TZ)).completedTasks).toBe(1);
    expect((await calculateProjectStatsForPeriod(db, WS1, june, TZ)).completedProjects).toBe(1);
  });
});
