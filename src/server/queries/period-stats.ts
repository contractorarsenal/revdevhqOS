import { and, eq, gte, lt, sql } from "drizzle-orm";
import { payments, clients, leads, projects, tasks } from "@/lib/db/schema";
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
 * revenue_collected goal metric by construction. */
export async function calculateRevenueForPeriod(
  dbOrTx: MetricDb,
  workspaceId: string,
  period: Period,
  timezone: string
): Promise<RevenueStats> {
  const rows = await dbOrTx
    .select({ amount: payments.amount })
    .from(payments)
    .where(revenuePaymentInPeriod(workspaceId, period, timezone));
  const amounts = rows.map((r) => Number(r.amount));
  const collected = roundCents(amounts.reduce((sum, a) => sum + a, 0));
  const paymentCount = amounts.length;
  return {
    collected,
    paymentCount,
    averagePayment: paymentCount > 0 ? roundCents(collected / paymentCount) : 0,
    largestPayment: paymentCount > 0 ? roundCents(Math.max(...amounts)) : 0,
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
