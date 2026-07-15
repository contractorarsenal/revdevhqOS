import "server-only";
import { and, eq, gte, isNull, lt, or, sql, inArray, count } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  subscriptions, invoices, payments, clients, opportunities, pipelineStages, tasks,
  activityLogs, profiles,
} from "@/lib/db/schema";
import {
  calculateMrr, calculateArr, outstandingRevenue, pastDueRevenue,
  pipelineValue, weightedPipelineValue, normalizeToMonthly, toAmount, roundCents,
  paymentRevenueDate,
} from "@/lib/finance/metrics";
import { todayInTimezone, zonedTimeToUtc } from "@/lib/date-tz";
import { monthPeriod } from "@/lib/goals";
import { revenuePaymentInPeriod } from "./payment-period";

/** Start of today / month in the workspace timezone, as UTC instants. */
function zonedBoundaries(timezone: string) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const [y, m, d] = fmt.format(now).split("-").map(Number);
  const offsetMs = (() => {
    const local = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    return now.getTime() - local.getTime();
  })();
  const dayStart = new Date(new Date(y, m - 1, d, 0, 0, 0).getTime() + offsetMs);
  const monthStart = new Date(new Date(y, m - 1, 1, 0, 0, 0).getTime() + offsetMs);
  return { dayStart, monthStart };
}

export async function getDashboardMetrics(workspaceId: string, timezone: string) {
  const { dayStart } = zonedBoundaries(timezone);
  // Current workspace-local month, attributed by the same authoritative
  // rule goals and reports use (billing_month first, else local paid date)
  // — the dashboard can never disagree with the Monthly Revenue goal.
  const today = todayInTimezone(timezone);
  const thisMonth = monthPeriod(Number(today.slice(0, 4)), Number(today.slice(5, 7)));

  const [subs, invoiceRows, todaysPayments, monthPayments, activeClientCount, oppRows, taskCounts] =
    await Promise.all([
      db
        .select({ amount: subscriptions.amount, frequency: subscriptions.frequency, status: subscriptions.status })
        .from(subscriptions)
        .where(eq(subscriptions.workspaceId, workspaceId)),
      db
        .select({ status: invoices.status, total: invoices.total, amountPaid: invoices.amountPaid, dueDate: invoices.dueDate })
        .from(invoices)
        .where(and(eq(invoices.workspaceId, workspaceId), inArray(invoices.status, ["open", "past_due"]))),
      // "Collected today" is deliberately a collection-activity metric —
      // cash that arrived today (paid_at) — not a billing-month attribution.
      db
        .select({ sum: sql<string>`coalesce(sum(${payments.amount}), 0)` })
        .from(payments)
        .where(and(eq(payments.workspaceId, workspaceId), eq(payments.status, "succeeded"), gte(payments.paidAt, dayStart))),
      db
        .select({ sum: sql<string>`coalesce(sum(${payments.amount}), 0)` })
        .from(payments)
        .where(revenuePaymentInPeriod(workspaceId, thisMonth, timezone)),
      db
        .select({ n: count() })
        .from(clients)
        .where(and(eq(clients.workspaceId, workspaceId), inArray(clients.status, ["active", "onboarding", "past_due"]))),
      db
        .select({ status: opportunities.status, value: opportunities.value, probability: pipelineStages.probability })
        .from(opportunities)
        .innerJoin(pipelineStages, eq(opportunities.stageId, pipelineStages.id))
        .where(eq(opportunities.workspaceId, workspaceId)),
      db
        .select({
          dueToday: sql<number>`count(*) filter (where ${tasks.status} in ('todo','in_progress') and ${tasks.dueDate} >= ${dayStart} and ${tasks.dueDate} < ${new Date(dayStart.getTime() + 86400000)})`,
          overdue: sql<number>`count(*) filter (where ${tasks.status} in ('todo','in_progress') and ${tasks.dueDate} < ${dayStart})`,
        })
        .from(tasks)
        .where(eq(tasks.workspaceId, workspaceId)),
    ]);

  const mrr = calculateMrr(subs);
  return {
    mrr,
    arr: calculateArr(mrr),
    collectedToday: roundCents(Number(todaysPayments[0]?.sum ?? 0)),
    collectedThisMonth: roundCents(Number(monthPayments[0]?.sum ?? 0)),
    activeClients: Number(activeClientCount[0]?.n ?? 0),
    outstanding: outstandingRevenue(invoiceRows),
    pastDue: pastDueRevenue(invoiceRows),
    pipelineValue: pipelineValue(oppRows),
    weightedPipeline: weightedPipelineValue(oppRows),
    tasksDueToday: Number(taskCounts[0]?.dueToday ?? 0),
    tasksOverdue: Number(taskCounts[0]?.overdue ?? 0),
  };
}

/** Monthly collected revenue for the trailing 12 workspace-local months,
 * bucketed by the authoritative revenue date (paymentRevenueDate:
 * billing_month first, else paid_at in the workspace timezone) — the same
 * attribution the Monthly Revenue goal uses, so the chart and the goal can
 * never tell different stories about a month. */
export async function getCollectedByMonth(workspaceId: string, timezone: string) {
  const today = todayInTimezone(timezone);
  const monthKeys: string[] = [];
  let [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  for (let i = 0; i < 12; i++) {
    monthKeys.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  const windowStart = `${monthKeys[0]}-01`;
  const windowStartUtc = zonedTimeToUtc(windowStart, "00:00", timezone);

  const rows = await db
    .select({ amount: payments.amount, billingMonth: payments.billingMonth, paidAt: payments.paidAt })
    .from(payments)
    .where(and(
      eq(payments.workspaceId, workspaceId),
      eq(payments.status, "succeeded"),
      or(gte(payments.billingMonth, windowStart), and(isNull(payments.billingMonth), gte(payments.paidAt, windowStartUtc)))
    ));

  const totals = new Map<string, number>();
  for (const r of rows) {
    const key = paymentRevenueDate(r, timezone).slice(0, 7);
    totals.set(key, (totals.get(key) ?? 0) + Number(r.amount));
  }

  return monthKeys.map((key) => ({
    month: new Date(`${key}-01T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
    collected: roundCents(totals.get(key) ?? 0),
  }));
}

/**
 * Approximate MRR history derived from subscription start/cancel dates:
 * a subscription contributes from its start month until cancellation/pause.
 */
export async function getMrrTrend(workspaceId: string) {
  const subs = await db
    .select({
      amount: subscriptions.amount,
      frequency: subscriptions.frequency,
      status: subscriptions.status,
      startDate: subscriptions.startDate,
      canceledAt: subscriptions.canceledAt,
      pausedAt: subscriptions.pausedAt,
    })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId));

  const series: { month: string; mrr: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const monthEnd = new Date();
    monthEnd.setMonth(monthEnd.getMonth() - i + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);
    let mrr = 0;
    for (const s of subs) {
      const started = s.startDate ? new Date(s.startDate) <= monthEnd : false;
      const endedBefore =
        (s.canceledAt && new Date(s.canceledAt) <= monthEnd) ||
        (s.pausedAt && s.status === "paused" && new Date(s.pausedAt) <= monthEnd);
      if (started && !endedBefore && s.status !== "trial") {
        mrr += normalizeToMonthly(toAmount(s.amount), s.frequency);
      }
    }
    series.push({
      month: monthEnd.toLocaleString("en-US", { month: "short" }),
      mrr: roundCents(mrr),
    });
  }
  return series;
}

export async function getRecentActivity(workspaceId: string, limit = 12) {
  return db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      entityType: activityLogs.entityType,
      metadata: activityLogs.metadata,
      createdAt: activityLogs.createdAt,
      actorName: profiles.name,
    })
    .from(activityLogs)
    .leftJoin(profiles, eq(activityLogs.actorId, profiles.id))
    .where(eq(activityLogs.workspaceId, workspaceId))
    .orderBy(sql`${activityLogs.createdAt} desc`)
    .limit(limit);
}

export async function getAttentionQueue(workspaceId: string) {
  const today = new Date();
  const soon = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
  const [overdueInvoices, renewals, overdueTasks] = await Promise.all([
    db
      .select({
        id: invoices.id, number: invoices.number, dueDate: invoices.dueDate,
        total: invoices.total, amountPaid: invoices.amountPaid, clientName: clients.name, clientId: invoices.clientId,
      })
      .from(invoices)
      .innerJoin(clients, eq(invoices.clientId, clients.id))
      .where(and(
        eq(invoices.workspaceId, workspaceId),
        inArray(invoices.status, ["open", "past_due"]),
        sql`${invoices.dueDate} < current_date`
      ))
      .limit(6),
    db
      .select({
        id: subscriptions.id, nextBillingDate: subscriptions.nextBillingDate,
        amount: subscriptions.amount, frequency: subscriptions.frequency, clientName: clients.name, clientId: subscriptions.clientId,
      })
      .from(subscriptions)
      .innerJoin(clients, eq(subscriptions.clientId, clients.id))
      .where(and(
        eq(subscriptions.workspaceId, workspaceId),
        eq(subscriptions.status, "active"),
        inArray(subscriptions.frequency, ["quarterly", "yearly"]),
        sql`${subscriptions.nextBillingDate} <= ${soon}`,
        sql`${subscriptions.nextBillingDate} >= current_date`
      ))
      .limit(4),
    db
      .select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate, clientName: clients.name })
      .from(tasks)
      .leftJoin(clients, eq(tasks.clientId, clients.id))
      .where(and(
        eq(tasks.workspaceId, workspaceId),
        inArray(tasks.status, ["todo", "in_progress"]),
        lt(tasks.dueDate, today)
      ))
      .limit(5),
  ]);
  return { overdueInvoices, renewals, overdueTasks };
}
