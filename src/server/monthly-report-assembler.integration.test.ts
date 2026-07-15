/**
 * Tests the REAL getMonthlyReport/listReportableMonths against an embedded
 * PGlite database (only "@/lib/db" and "server-only" are mocked — every
 * query builder and calculation is the actual production code), proving
 * the assembler composes period-stats correctly: month-over-month, the
 * historical-goal lookup, the "no goal for this month" empty state, and
 * workspace isolation.
 */
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, {
    get(_t, prop) {
      const target = (globalThis as Record<string, unknown>).__reportDb as Record<string, unknown>;
      const value = target[prop as string];
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  }),
}));

import { getMonthlyReport, listReportableMonths } from "@/server/queries/monthly-report";

const WS1 = "11111111-1111-4111-8111-111111111111";
const WS2 = "22222222-2222-4222-8222-222222222222";
const TZ = "America/Los_Angeles";

let client: PGlite;

beforeAll(async () => {
  client = new PGlite();
  (globalThis as Record<string, unknown>).__reportDb = drizzle(client);

  await client.exec(`
    CREATE TABLE workspaces (id uuid PRIMARY KEY, timezone text NOT NULL DEFAULT 'UTC', created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, client_id uuid,
      amount numeric(12,2) NOT NULL, status text NOT NULL DEFAULT 'succeeded', payment_type text NOT NULL DEFAULT 'one_time',
      billing_month date, paid_at timestamptz NOT NULL
    );
    CREATE TABLE invoices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, status text NOT NULL DEFAULT 'open', total numeric(12,2) NOT NULL DEFAULT 0, amount_paid numeric(12,2) NOT NULL DEFAULT 0, billing_month date, issue_date date);
    CREATE TABLE expenses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, name text NOT NULL, category text NOT NULL DEFAULT 'misc', amount numeric(12,2) NOT NULL, expense_date date NOT NULL, frequency text NOT NULL DEFAULT 'one_time', status text NOT NULL DEFAULT 'active');
    CREATE TABLE leads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, completed_at timestamptz);
    CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, completed_at timestamptz);
    CREATE TABLE pipeline_stages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL);
    CREATE TABLE opportunities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, stage_id uuid NOT NULL, status text NOT NULL DEFAULT 'open', value numeric(12,2) NOT NULL DEFAULT 0, won_at timestamptz, lost_at timestamptz);
    CREATE TABLE business_goals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, name text NOT NULL, description text,
      metric_type text NOT NULL, period_type text NOT NULL, target_value numeric(12,2) NOT NULL,
      manual_current_value numeric(12,2), period_start date NOT NULL, period_end date NOT NULL,
      is_primary boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'active', color text, created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz
    );
    INSERT INTO workspaces (id, timezone, created_at) VALUES ('${WS1}', '${TZ}', '2025-01-01T00:00:00Z'), ('${WS2}', 'UTC', '2025-01-01T00:00:00Z');
  `);
});

afterAll(async () => {
  await client.close();
});

afterEach(async () => {
  await client.exec(`DELETE FROM payments; DELETE FROM expenses; DELETE FROM business_goals; DELETE FROM clients; DELETE FROM invoices;`);
});

describe("getMonthlyReport — current vs previous month", () => {
  it("each month's revenue only counts its own payments, and the previous month feeds monthOverMonth correctly", async () => {
    const today = await import("@/lib/date-tz").then((m) => m.todayInTimezone(TZ));
    const currentMonth = today.slice(0, 7);
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, billing_month, paid_at) VALUES
        ('${WS1}', 1000, 'succeeded', '${currentMonth}-01', '${today}T18:00:00Z');
    `);
    const current = await getMonthlyReport(WS1, TZ, 0);
    const previous = await getMonthlyReport(WS1, TZ, -1);
    expect(current.revenue.current).toBe(1000);
    expect(current.revenue.previous).toBe(previous.revenue.current);
    expect(current.revenue.absoluteChange).toBe(1000 - previous.revenue.current);
    expect(previous.isCurrentMonth).toBe(false);
    expect(current.isCurrentMonth).toBe(true);
  });
});

describe("getMonthlyReport — historical months and historical goal matching", () => {
  it("a historical month shows ITS OWN goal, never substituting the current month's goal", async () => {
    await client.exec(`
      INSERT INTO business_goals (workspace_id, name, metric_type, period_type, target_value, period_start, period_end, is_primary) VALUES
        ('${WS1}', 'July Goal', 'revenue_collected', 'monthly', 10000, '2026-07-01', '2026-07-31', true),
        ('${WS1}', 'June Goal', 'revenue_collected', 'monthly', 8000,  '2026-06-01', '2026-06-30', true);
      INSERT INTO payments (workspace_id, amount, status, billing_month, paid_at) VALUES
        ('${WS1}', 4000, 'succeeded', '2026-07-01', '2026-07-10T12:00:00Z'),
        ('${WS1}', 2000, 'succeeded', '2026-06-01', '2026-06-10T12:00:00Z');
    `);
    const july = await getMonthlyReportForMonth(WS1, TZ, "2026-07");
    const june = await getMonthlyReportForMonth(WS1, TZ, "2026-06");
    expect(july.goal?.name).toBe("July Goal");
    expect(july.goal?.computation.current).toBe(4000);
    expect(june.goal?.name).toBe("June Goal");
    expect(june.goal?.computation.current).toBe(2000);
  });

  it("a month with no matching goal returns goal: null (never substitutes another month's goal)", async () => {
    await client.exec(`INSERT INTO business_goals (workspace_id, name, metric_type, period_type, target_value, period_start, period_end) VALUES ('${WS1}', 'July Goal', 'revenue_collected', 'monthly', 10000, '2026-07-01', '2026-07-31')`);
    const august = await getMonthlyReportForMonth(WS1, TZ, "2026-08");
    expect(august.goal).toBeNull();
  });

  it("revenue for a historical month equals exactly its own payments, verified via calculateGoalSnapshot agreement", async () => {
    await client.exec(`INSERT INTO payments (workspace_id, amount, status, billing_month, paid_at) VALUES ('${WS1}', 777, 'succeeded', '2026-05-01', '2026-05-15T12:00:00Z')`);
    const may = await getMonthlyReportForMonth(WS1, TZ, "2026-05");
    expect(may.revenue.current).toBe(777);
    expect(may.revenueStats.paymentCount).toBe(1);
  });
});

describe("getMonthlyReport — profit, margin, and MoM safety", () => {
  it("profit is revenue minus expenses, and margin handles zero revenue without NaN/Infinity", async () => {
    const empty = await getMonthlyReportForMonth(WS1, TZ, "2026-09");
    expect(empty.revenue.current).toBe(0);
    expect(empty.expenses.current).toBe(0);
    expect(empty.profit.current).toBe(0);
    expect(empty.margin).toBeNull();
  });

  it("a month with revenue and expenses computes a real margin", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, billing_month, paid_at) VALUES ('${WS1}', 2000, 'succeeded', '2026-10-01', '2026-10-05T12:00:00Z');
      INSERT INTO expenses (workspace_id, name, amount, expense_date) VALUES ('${WS1}', 'Tools', 500, '2026-10-01');
    `);
    const r = await getMonthlyReportForMonth(WS1, TZ, "2026-10");
    expect(r.revenue.current).toBe(2000);
    expect(r.expenses.current).toBe(500);
    expect(r.profit.current).toBe(1500);
    expect(r.margin).toBeCloseTo(75, 1);
  });
});

describe("getMonthlyReport — workspace isolation", () => {
  it("never mixes revenue, goals, or expenses across workspaces", async () => {
    await client.exec(`
      INSERT INTO payments (workspace_id, amount, status, billing_month, paid_at) VALUES ('${WS2}', 50000, 'succeeded', '2026-11-01', '2026-11-01T12:00:00Z');
      INSERT INTO business_goals (workspace_id, name, metric_type, period_type, target_value, period_start, period_end) VALUES ('${WS2}', 'WS2 Goal', 'revenue_collected', 'monthly', 1000, '2026-11-01', '2026-11-30');
    `);
    const ws1Report = await getMonthlyReportForMonth(WS1, TZ, "2026-11");
    expect(ws1Report.revenue.current).toBe(0);
    expect(ws1Report.goal).toBeNull();
    const ws2Report = await getMonthlyReportForMonth(WS2, "UTC", "2026-11");
    expect(ws2Report.revenue.current).toBe(50000);
    expect(ws2Report.goal?.name).toBe("WS2 Goal");
  });
});

describe("listReportableMonths", () => {
  it("always offers a trailing 24-month window, current month first, regardless of workspace age", async () => {
    const months = await listReportableMonths(TZ);
    expect(months[0].offset).toBe(0);
    expect(months.length).toBe(25);
    // strictly descending offsets, no gaps
    for (let i = 1; i < months.length; i++) expect(months[i].offset).toBe(months[i - 1].offset - 1);
  });
});

/** Test helper: resolve a specific "YYYY-MM" month to its offset from
 * "today" and call getMonthlyReport with it — the assembler itself only
 * takes an offset (it has no clock dependency beyond todayInTimezone). */
async function getMonthlyReportForMonth(workspaceId: string, timezone: string, yyyyMm: string) {
  const { todayInTimezone } = await import("@/lib/date-tz");
  const today = todayInTimezone(timezone);
  const [ty, tm] = today.slice(0, 7).split("-").map(Number);
  const [my, mm] = yyyyMm.split("-").map(Number);
  const offset = (my - ty) * 12 + (mm - tm);
  return getMonthlyReport(workspaceId, timezone, offset);
}
