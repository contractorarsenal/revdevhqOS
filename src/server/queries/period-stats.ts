import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { payments, clients, leads, projects, tasks, expenses, invoices, opportunities } from "@/lib/db/schema";
import { roundCents } from "@/lib/finance/metrics";
import { todayInTimezone } from "@/lib/date-tz";
import {
  computeGoal, isManualMetric,
  type GoalComputation, type GoalMetricType, type Period,
} from "@/lib/goals";
import { metricValueInPeriod, type MetricDb } from "./goal-metrics";
import { periodUtcBounds, revenuePaymentInPeriod } from "./payment-period";

/**
 * Reusable, period-scoped business calculations. Every function here is
 * deliberately narrow: it computes exactly what the underlying records can
 * honestly support for an arbitrary calendar period (no invented historical
 * snapshots — e.g. there is no "active clients as of a past date" here,
 * because client status has no change history to reconstruct it from).
 *
 * Built for the Goals live-recalculation work but written to be the shared
 * foundation for Monthly Reports later: pass any workspace-local calendar
 * period plus the workspace timezone and get exactly the numbers a report
 * or a goal would show for that window — revenue uses the authoritative
 * billing-month-first attribution (revenuePaymentInPeriod), count metrics
 * use the period's UTC window.
 *
 * Deliberately NOT "server-only" and parameterized over the db handle (like
 * goal-metrics.metricValueInPeriod), so PGlite integration tests exercise
 * the exact query builders production runs, without touching a real DB.
 */

export type RevenueStats = {
  collected: number;
  paymentCount: number;
  averagePayment: number;
  largestPayment: number;
};

/** Succeeded payments attributed to the period by the authoritative rule
 * (billing_month first, else workspace-local paid_at) — identical to the
 * revenue_collected goal metric by construction. Aggregated in SQL (one
 * query, no per-row fetch) rather than pulling every payment and reducing
 * in JS. */
export async function calculateRevenueForPeriod(
  dbOrTx: MetricDb,
  workspaceId: string,
  period: Period,
  timezone: string
): Promise<RevenueStats> {
  const [row] = await dbOrTx
    .select({
      collected: sql<string>`coalesce(sum(${payments.amount}), 0)`,
      paymentCount: sql<string>`count(*)`,
      largestPayment: sql<string>`coalesce(max(${payments.amount}), 0)`,
    })
    .from(payments)
    .where(revenuePaymentInPeriod(workspaceId, period, timezone));
  const collected = roundCents(Number(row?.collected ?? 0));
  const paymentCount = Number(row?.paymentCount ?? 0);
  return {
    collected,
    paymentCount,
    averagePayment: paymentCount > 0 ? roundCents(collected / paymentCount) : 0,
    largestPayment: roundCents(Number(row?.largestPayment ?? 0)),
  };
}

export type RevenueBreakdown = {
  oneTime: number;
  recurring: number;
  byPaymentType: { paymentType: string; amount: number }[];
  byClient: { clientId: string | null; clientName: string | null; amount: number }[];
};

/**
 * How the period's revenue splits by payment type and by client. Uses the
 * exact same WHERE clause as calculateRevenueForPeriod (revenuePaymentInPeriod),
 * so the sum of byClient/byPaymentType always equals calculateRevenueForPeriod's
 * collected total — structurally impossible to double-count or drift.
 */
export async function calculateRevenueBreakdownForPeriod(
  dbOrTx: MetricDb,
  workspaceId: string,
  period: Period,
  timezone: string
): Promise<RevenueBreakdown> {
  const [byType, byClient] = await Promise.all([
    dbOrTx
      .select({ paymentType: payments.paymentType, amount: sql<string>`sum(${payments.amount})` })
      .from(payments)
      .where(revenuePaymentInPeriod(workspaceId, period, timezone))
      .groupBy(payments.paymentType),
    dbOrTx
      .select({ clientId: payments.clientId, clientName: clients.name, amount: sql<string>`sum(${payments.amount})` })
      .from(payments)
      .leftJoin(clients, eq(payments.clientId, clients.id))
      .where(revenuePaymentInPeriod(workspaceId, period, timezone))
      .groupBy(payments.clientId, clients.name)
      .orderBy(desc(sql`sum(${payments.amount})`)),
  ]);
  const oneTime = roundCents(Number(byType.find((r) => r.paymentType === "one_time")?.amount ?? 0));
  const recurring = roundCents(
    byType.filter((r) => r.paymentType !== "one_time").reduce((sum, r) => sum + Number(r.amount), 0)
  );
  return {
    oneTime,
    recurring,
    byPaymentType: byType.map((r) => ({ paymentType: r.paymentType, amount: roundCents(Number(r.amount)) })),
    byClient: byClient.map((r) => ({ clientId: r.clientId, clientName: r.clientName, amount: roundCents(Number(r.amount)) })),
  };
}

export type ClientStats = { newClients: number };

/** Clients created in the period. Matches the new_clients goal metric. */
export async function calculateClientStatsForPeriod(
  dbOrTx: MetricDb,
  workspaceId: string,
  period: Period,
  timezone: string
): Promise<ClientStats> {
  const bounds = periodUtcBounds(period, timezone);
  const [row] = await dbOrTx
    .select({ n: sql<string>`count(*)` })
    .from(clients)
    .where(and(eq(clients.workspaceId, workspaceId), gte(clients.createdAt, bounds.start), lt(clients.createdAt, bounds.end)));
  return { newClients: Number(row?.n ?? 0) };
}

export type LeadStats = { newLeads: number };

/** Leads created in the period. Matches the new_leads goal metric. Lead
 * conversion has no timestamp column to attribute "converted in period"
 * honestly, so it is deliberately not reported here. */
export async function calculateLeadStatsForPeriod(
  dbOrTx: MetricDb,
  workspaceId: string,
  period: Period,
  timezone: string
): Promise<LeadStats> {
  const bounds = periodUtcBounds(period, timezone);
  const [row] = await dbOrTx
    .select({ n: sql<string>`count(*)` })
    .from(leads)
    .where(and(eq(leads.workspaceId, workspaceId), gte(leads.createdAt, bounds.start), lt(leads.createdAt, bounds.end)));
  return { newLeads: Number(row?.n ?? 0) };
}

export type TaskStats = { completedTasks: number };

/** Tasks completed in the period, by completed_at. */
export async function calculateTaskStatsForPeriod(
  dbOrTx: MetricDb,
  workspaceId: string,
  period: Period,
  timezone: string
): Promise<TaskStats> {
  const bounds = periodUtcBounds(period, timezone);
  const [row] = await dbOrTx
    .select({ n: sql<string>`count(*)` })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), gte(tasks.completedAt, bounds.start), lt(tasks.completedAt, bounds.end)));
  return { completedTasks: Number(row?.n ?? 0) };
}

export type ProjectStats = { completedProjects: number };

/** Projects completed in the period, by completed_at. */
export async function calculateProjectStatsForPeriod(
  dbOrTx: MetricDb,
  workspaceId: string,
  period: Period,
  timezone: string
): Promise<ProjectStats> {
  const bounds = periodUtcBounds(period, timezone);
  const [row] = await dbOrTx
    .select({ n: sql<string>`count(*)` })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), gte(projects.completedAt, bounds.start), lt(projects.completedAt, bounds.end)));
  return { completedProjects: Number(row?.n ?? 0) };
}

export type ExpenseBreakdown = {
  total: number;
  byCategory: { category: string; amount: number }[];
  largest: { name: string; amount: number; category: string } | null;
};

/**
 * Active expenses effective in the period: one-time (or weekly/quarterly/
 * yearly) expenses dated inside it, plus monthly recurring expenses that
 * started on or before the period ends (a recurring expense keeps applying
 * every month going forward — the same "effective in month" rule as the
 * existing Reports page, generalized to any period).
 */
export async function calculateExpenseBreakdownForPeriod(
  dbOrTx: MetricDb,
  workspaceId: string,
  period: Period
): Promise<ExpenseBreakdown> {
  const rows = await dbOrTx
    .select({ name: expenses.name, category: expenses.category, amount: expenses.amount })
    .from(expenses)
    .where(and(
      eq(expenses.workspaceId, workspaceId),
      eq(expenses.status, "active"),
      or(
        and(eq(expenses.frequency, "monthly"), lte(expenses.expenseDate, period.end)),
        and(sql`${expenses.frequency} != 'monthly'`, gte(expenses.expenseDate, period.start), lte(expenses.expenseDate, period.end))
      )
    ));
  const total = roundCents(rows.reduce((sum, r) => sum + Number(r.amount), 0));
  const byCategoryMap = new Map<string, number>();
  let largest: ExpenseBreakdown["largest"] = null;
  for (const r of rows) {
    byCategoryMap.set(r.category, (byCategoryMap.get(r.category) ?? 0) + Number(r.amount));
    if (!largest || Number(r.amount) > largest.amount) {
      largest = { name: r.name, amount: roundCents(Number(r.amount)), category: r.category };
    }
  }
  return {
    total,
    byCategory: [...byCategoryMap.entries()]
      .map(([category, amount]) => ({ category, amount: roundCents(amount) }))
      .sort((a, b) => b.amount - a.amount),
    largest,
  };
}

export type OutstandingInvoiceStats = { outstanding: number; count: number };

/**
 * Unpaid balance of invoices attributable to the period — billing_month
 * when set, else issue_date — mirroring the payment attribution rule so an
 * invoice and its eventual payment are talked about the same way. This
 * answers "how much from THIS month's invoicing is still uncollected", not
 * a workspace-wide current snapshot (that is outstandingRevenue() in
 * lib/finance/metrics.ts, used by the dashboard).
 */
export async function calculateOutstandingInvoicesForPeriod(
  dbOrTx: MetricDb,
  workspaceId: string,
  period: Period
): Promise<OutstandingInvoiceStats> {
  const rows = await dbOrTx
    .select({ total: invoices.total, amountPaid: invoices.amountPaid })
    .from(invoices)
    .where(and(
      eq(invoices.workspaceId, workspaceId),
      inArray(invoices.status, ["open", "past_due"]),
      or(
        and(isNotNull(invoices.billingMonth), gte(invoices.billingMonth, period.start), lte(invoices.billingMonth, period.end)),
        and(isNull(invoices.billingMonth), isNotNull(invoices.issueDate), gte(invoices.issueDate, period.start), lte(invoices.issueDate, period.end))
      )
    ));
  const outstanding = roundCents(
    rows.reduce((sum, r) => sum + Math.max(0, Number(r.total) - Number(r.amountPaid)), 0)
  );
  return { outstanding, count: rows.length };
}

export type OpportunityPeriodStats = {
  wonCount: number;
  wonValue: number;
  lostCount: number;
  /** Win rate of opportunities DECIDED this period (won / (won + lost)) —
   * not a lead-to-close conversion rate, which would need cohort tracking
   * this schema doesn't have. null when nothing was decided this period. */
  winRate: number | null;
};

/** Opportunities won or lost in the period, by their real won_at/lost_at
 * timestamps — the only honestly period-attributable pipeline outcome. */
export async function calculateOpportunityStatsForPeriod(
  dbOrTx: MetricDb,
  workspaceId: string,
  period: Period,
  timezone: string
): Promise<OpportunityPeriodStats> {
  const bounds = periodUtcBounds(period, timezone);
  const [won, lost] = await Promise.all([
    dbOrTx
      .select({ n: sql<string>`count(*)`, value: sql<string>`coalesce(sum(${opportunities.value}), 0)` })
      .from(opportunities)
      .where(and(eq(opportunities.workspaceId, workspaceId), eq(opportunities.status, "won"), gte(opportunities.wonAt, bounds.start), lt(opportunities.wonAt, bounds.end))),
    dbOrTx
      .select({ n: sql<string>`count(*)` })
      .from(opportunities)
      .where(and(eq(opportunities.workspaceId, workspaceId), eq(opportunities.status, "lost"), gte(opportunities.lostAt, bounds.start), lt(opportunities.lostAt, bounds.end))),
  ]);
  const wonCount = Number(won[0]?.n ?? 0);
  const lostCount = Number(lost[0]?.n ?? 0);
  const decided = wonCount + lostCount;
  return {
    wonCount,
    wonValue: roundCents(Number(won[0]?.value ?? 0)),
    lostCount,
    winRate: decided > 0 ? Math.round((wonCount / decided) * 10000) / 100 : null,
  };
}

export type GoalSnapshotInput = {
  metricType: GoalMetricType;
  targetValue: number | string;
  manualCurrentValue: number | string | null;
  periodStart: string;
  periodEnd: string;
};

/**
 * Recomputes a single goal's full live state (current value, progress,
 * pace, projection, status) for "right now" in the workspace's timezone.
 * The one place goal.ts's withProgress() and any future point-in-time
 * report snapshot should both call, so the math can never drift between
 * the two call sites.
 */
export async function calculateGoalSnapshot(
  dbOrTx: MetricDb,
  workspaceId: string,
  timezone: string,
  goal: GoalSnapshotInput
): Promise<GoalComputation> {
  const metricType = goal.metricType;
  const manual = isManualMetric(metricType);
  const currentValue = manual
    ? Number(goal.manualCurrentValue ?? 0)
    : await metricValueInPeriod(dbOrTx, workspaceId, metricType, { start: goal.periodStart, end: goal.periodEnd }, timezone);
  const today = todayInTimezone(timezone);
  return computeGoal({
    current: currentValue,
    target: Number(goal.targetValue),
    periodStart: goal.periodStart,
    periodEnd: goal.periodEnd,
    today,
  });
}
