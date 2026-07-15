import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessGoals } from "@/lib/db/schema";
import { todayInTimezone } from "@/lib/date-tz";
import { periodLabel, type GoalComputation } from "@/lib/goals";
import { monthPeriodByOffset, monthOverMonth, profitMargin, type ChangeStats } from "@/lib/reports";
import {
  calculateRevenueForPeriod, calculateRevenueBreakdownForPeriod, calculateClientStatsForPeriod,
  calculateLeadStatsForPeriod, calculateTaskStatsForPeriod, calculateProjectStatsForPeriod,
  calculateExpenseBreakdownForPeriod, calculateOutstandingInvoicesForPeriod, calculateOpportunityStatsForPeriod,
  calculateGoalSnapshot,
  type RevenueStats, type RevenueBreakdown, type ExpenseBreakdown, type OutstandingInvoiceStats, type OpportunityPeriodStats,
} from "./period-stats";

export type MonthlyGoalSummary = {
  name: string;
  targetValue: number;
  computation: GoalComputation;
};

export type MonthlyReport = {
  monthOffset: number;
  isCurrentMonth: boolean;
  periodLabel: string;
  period: { start: string; end: string };

  revenue: ChangeStats;
  revenueStats: RevenueStats;
  revenueBreakdown: RevenueBreakdown;

  expenses: ChangeStats;
  expenseBreakdown: ExpenseBreakdown;

  profit: ChangeStats;
  margin: number | null;
  prevMargin: number | null;

  newClients: ChangeStats;
  newLeads: ChangeStats;
  tasksCompleted: number;
  projectsCompleted: number;

  outstandingInvoices: OutstandingInvoiceStats;
  opportunities: OpportunityPeriodStats;

  /** null when no revenue_collected/monthly goal exists whose period starts
   * exactly on this month — the UI shows "No revenue goal was set for this
   * month" rather than substituting a different goal. */
  goal: MonthlyGoalSummary | null;
};

/**
 * Assembles one month's full report. Every number comes from the same
 * period-stats services Goals uses (revenuePaymentInPeriod-backed), so
 * Report revenue and Goal revenue can never disagree for the same period —
 * this function does not re-derive revenue attribution itself.
 */
export async function getMonthlyReport(workspaceId: string, timezone: string, monthOffset: number): Promise<MonthlyReport> {
  const today = todayInTimezone(timezone);
  const period = monthPeriodByOffset(today, monthOffset);
  const prevPeriod = monthPeriodByOffset(today, monthOffset - 1);

  const [
    revenue, prevRevenue, revenueBreakdown,
    clientStats, prevClientStats, leadStats, prevLeadStats,
    taskStats, projectStats,
    expenseBreakdown, prevExpenseBreakdown,
    outstandingInvoices, opportunityStats,
    goalRows,
  ] = await Promise.all([
    calculateRevenueForPeriod(db, workspaceId, period, timezone),
    calculateRevenueForPeriod(db, workspaceId, prevPeriod, timezone),
    calculateRevenueBreakdownForPeriod(db, workspaceId, period, timezone),
    calculateClientStatsForPeriod(db, workspaceId, period, timezone),
    calculateClientStatsForPeriod(db, workspaceId, prevPeriod, timezone),
    calculateLeadStatsForPeriod(db, workspaceId, period, timezone),
    calculateLeadStatsForPeriod(db, workspaceId, prevPeriod, timezone),
    calculateTaskStatsForPeriod(db, workspaceId, period, timezone),
    calculateProjectStatsForPeriod(db, workspaceId, period, timezone),
    calculateExpenseBreakdownForPeriod(db, workspaceId, period),
    calculateExpenseBreakdownForPeriod(db, workspaceId, prevPeriod),
    calculateOutstandingInvoicesForPeriod(db, workspaceId, period),
    calculateOpportunityStatsForPeriod(db, workspaceId, period, timezone),
    db
      .select()
      .from(businessGoals)
      .where(and(
        eq(businessGoals.workspaceId, workspaceId),
        eq(businessGoals.metricType, "revenue_collected"),
        eq(businessGoals.periodType, "monthly"),
        eq(businessGoals.periodStart, period.start)
      ))
      .orderBy(desc(businessGoals.isPrimary), asc(businessGoals.createdAt))
      .limit(1),
  ]);

  const profit = revenue.collected - expenseBreakdown.total;
  const prevProfit = prevRevenue.collected - prevExpenseBreakdown.total;

  let goal: MonthlyGoalSummary | null = null;
  const goalRow = goalRows[0];
  if (goalRow) {
    const computation = await calculateGoalSnapshot(db, workspaceId, timezone, {
      metricType: "revenue_collected",
      targetValue: goalRow.targetValue,
      manualCurrentValue: null,
      periodStart: period.start,
      periodEnd: period.end,
    });
    goal = { name: goalRow.name, targetValue: Number(goalRow.targetValue), computation };
  }

  return {
    monthOffset,
    isCurrentMonth: monthOffset === 0,
    periodLabel: periodLabel("monthly", period),
    period,
    revenue: monthOverMonth(revenue.collected, prevRevenue.collected),
    revenueStats: revenue,
    revenueBreakdown,
    expenses: monthOverMonth(expenseBreakdown.total, prevExpenseBreakdown.total),
    expenseBreakdown,
    profit: monthOverMonth(profit, prevProfit),
    margin: profitMargin(revenue.collected, profit),
    prevMargin: profitMargin(prevRevenue.collected, prevProfit),
    newClients: monthOverMonth(clientStats.newClients, prevClientStats.newClients),
    newLeads: monthOverMonth(leadStats.newLeads, prevLeadStats.newLeads),
    tasksCompleted: taskStats.completedTasks,
    projectsCompleted: projectStats.completedProjects,
    outstandingInvoices,
    opportunities: opportunityStats,
    goal,
  };
}

export type ReportableMonth = { offset: number; value: string; label: string };

/** Month-selector options: this month back to workspace creation (capped at
 * 24 months regardless of workspace age — same trailing-window convention
 * as getMrrTrend/getCollectedByMonth. A month before the workspace existed
 * still resolves (honestly: zero revenue, no goal, "no data available"),
 * matching the brief's "Previous month" always being selectable rather
 * than only ever offering the single month a brand-new workspace was
 * created in. */
export async function listReportableMonths(timezone: string): Promise<ReportableMonth[]> {
  const today = todayInTimezone(timezone);
  const months: ReportableMonth[] = [];
  for (let offset = 0; offset >= -24; offset--) {
    const period = monthPeriodByOffset(today, offset);
    months.push({ offset, value: period.start.slice(0, 7), label: periodLabel("monthly", period) });
  }
  return months;
}
