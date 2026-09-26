import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  approvals, clientLeads, clientRequests, clients, leads, opportunities, payments, pipelineStages,
  profiles, projects, tasks, userDashboardPrefs,
} from "@/lib/db/schema";
import { classifyWaitingOn, attentionReasons, STAGE_ORDER } from "@/lib/project-ops";
import { normalizeLayout, type DashboardLayout } from "@/lib/dashboard-layout";
import { addDaysStr, weekPeriodContaining } from "@/lib/goals";
import { dayBoundsInTimezone, todayInTimezone, zonedTimeToUtc } from "@/lib/date-tz";
import { roundCents, toAmount } from "@/lib/finance/metrics";
import { listCalendarFeed } from "./calendar";
import { listDueSubscriptions } from "./recurring";
import type { WaitingOnParty } from "@/lib/validation";

const OPEN_TASK = ["todo", "in_progress", "waiting"] as const;

export async function getDashboardLayout(profileId: string, workspaceId: string): Promise<DashboardLayout> {
  const [row] = await db
    .select({ layout: userDashboardPrefs.layout })
    .from(userDashboardPrefs)
    .where(and(eq(userDashboardPrefs.profileId, profileId), eq(userDashboardPrefs.workspaceId, workspaceId)))
    .limit(1);
  return normalizeLayout(row?.layout);
}

export async function getDashboardOps(workspaceId: string, timezone: string, currentUserId: string) {
  const today = todayInTimezone(timezone);
  const { start: dayStart, end: dayEnd } = dayBoundsInTimezone(timezone, today);
  const now = new Date();
  const week = weekPeriodContaining(today);
  const weekStart = zonedTimeToUtc(week.start, "00:00", timezone);
  const weekEnd = zonedTimeToUtc(addDaysStr(week.end, 1), "00:00", timezone);

  const [
    projectRows, overdueByProject, myTasks, workloadRows, requestRows, approvalRows,
    oppRows, openLeadCount, clientLeadRow, weekPayments, dueSubs, calendar,
  ] = await Promise.all([
    db
      .select({
        id: projects.id, name: projects.name, status: projects.status, dueDate: projects.dueDate,
        waitingOn: projects.waitingOn, waitingOnParty: projects.waitingOnParty, nextAction: projects.nextAction,
        updatedAt: projects.updatedAt, clientName: clients.name, ownerName: profiles.name,
      })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(profiles, eq(projects.ownerId, profiles.id))
      .where(and(eq(projects.workspaceId, workspaceId), isNull(projects.archivedAt), ne(projects.status, "closed"))),
    db
      .select({ projectId: tasks.projectId, n: sql<number>`count(*)` })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspaceId), isNotNull(tasks.projectId), inArray(tasks.status, [...OPEN_TASK]), lt(tasks.dueDate, dayStart)))
      .groupBy(tasks.projectId),
    db
      .select({
        id: tasks.id, title: tasks.title, status: tasks.status, priority: tasks.priority, dueDate: tasks.dueDate,
        clientName: clients.name,
      })
      .from(tasks)
      .leftJoin(clients, eq(tasks.clientId, clients.id))
      .where(and(
        eq(tasks.workspaceId, workspaceId), eq(tasks.assigneeId, currentUserId), inArray(tasks.status, [...OPEN_TASK]),
        or(lt(tasks.dueDate, dayEnd), inArray(tasks.priority, ["high", "urgent"]))
      ))
      .orderBy(asc(tasks.dueDate))
      .limit(30),
    db
      .select({
        assigneeId: tasks.assigneeId, name: profiles.name,
        open: sql<number>`count(*)`,
        overdue: sql<number>`count(*) filter (where ${tasks.dueDate} < ${dayStart})`,
        dueToday: sql<number>`count(*) filter (where ${tasks.dueDate} >= ${dayStart} and ${tasks.dueDate} < ${dayEnd})`,
      })
      .from(tasks)
      .leftJoin(profiles, eq(tasks.assigneeId, profiles.id))
      .where(and(eq(tasks.workspaceId, workspaceId), inArray(tasks.status, [...OPEN_TASK])))
      .groupBy(tasks.assigneeId, profiles.name),
    db
      .select({
        id: clientRequests.id, status: clientRequests.status, description: clientRequests.description, type: clientRequests.type,
        createdAt: clientRequests.createdAt, updatedAt: clientRequests.updatedAt, clientName: clients.name,
      })
      .from(clientRequests)
      .leftJoin(clients, eq(clientRequests.clientId, clients.id))
      .where(eq(clientRequests.workspaceId, workspaceId))
      .orderBy(desc(clientRequests.createdAt))
      .limit(100),
    db
      .select({
        id: approvals.id, title: approvals.title, type: approvals.type, requestedAction: approvals.requestedAction,
        riskSummary: approvals.riskSummary, createdAt: approvals.createdAt, clientName: clients.name, projectName: projects.name,
      })
      .from(approvals)
      .leftJoin(clients, eq(approvals.clientId, clients.id))
      .leftJoin(projects, eq(approvals.projectId, projects.id))
      .where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.status, "pending")))
      .orderBy(asc(approvals.createdAt))
      .limit(6),
    db
      .select({
        stage: pipelineStages.name, position: pipelineStages.position, isWon: pipelineStages.isWon, isLost: pipelineStages.isLost,
        n: sql<number>`count(${opportunities.id})`, value: sql<string>`coalesce(sum(${opportunities.value}), 0)`,
      })
      .from(pipelineStages)
      .leftJoin(opportunities, and(eq(opportunities.stageId, pipelineStages.id), eq(opportunities.status, "open")))
      .where(eq(pipelineStages.workspaceId, workspaceId))
      .groupBy(pipelineStages.id, pipelineStages.name, pipelineStages.position, pipelineStages.isWon, pipelineStages.isLost)
      .orderBy(asc(pipelineStages.position)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(leads)
      .where(and(eq(leads.workspaceId, workspaceId), inArray(leads.status, ["new", "contacted", "qualified"]), isNull(leads.clientId))),
    db
      .select({
        today: sql<number>`count(*) filter (where ${clientLeads.receivedAt} >= ${dayStart} and ${clientLeads.receivedAt} < ${dayEnd})`,
        week: sql<number>`count(*) filter (where ${clientLeads.receivedAt} >= ${weekStart} and ${clientLeads.receivedAt} < ${weekEnd})`,
        needsResponse: sql<number>`count(*) filter (where ${clientLeads.status} = 'new' and ${clientLeads.lastContactedAt} is null)`,
      })
      .from(clientLeads)
      .where(and(eq(clientLeads.workspaceId, workspaceId), isNull(clientLeads.archivedAt))),
    db
      .select({ sum: sql<string>`coalesce(sum(${payments.amount}), 0)`, n: sql<number>`count(*)` })
      .from(payments)
      .where(and(eq(payments.workspaceId, workspaceId), eq(payments.status, "succeeded"), gte(payments.paidAt, weekStart), lt(payments.paidAt, weekEnd))),
    listDueSubscriptions(workspaceId, timezone),
    listCalendarFeed(workspaceId, dayStart, zonedTimeToUtc(addDaysStr(today, 8), "00:00", timezone), timezone, { includeGoals: false }),
  ]);

  /* ---- projects: stage counts, waiting-on, attention ---- */
  const stageCounts = Object.fromEntries(STAGE_ORDER.map((s) => [s, 0])) as Record<(typeof STAGE_ORDER)[number], number>;
  for (const p of projectRows) if (p.status in stageCounts) stageCounts[p.status as keyof typeof stageCounts] += 1;

  const overdueMap = new Map(overdueByProject.map((r) => [r.projectId as string, Number(r.n)]));

  const waitingGroups: Record<WaitingOnParty, { id: string; name: string; clientName: string | null; waitingOn: string | null; days: number }[]> = {
    client: [], ca: [], jay: [], third_party: [], other: [],
  };
  for (const p of projectRows) {
    const party = classifyWaitingOn(p);
    if (!party) continue;
    waitingGroups[party].push({
      id: p.id, name: p.name, clientName: p.clientName, waitingOn: p.waitingOn,
      days: Math.floor((now.getTime() - p.updatedAt.getTime()) / 86_400_000),
    });
  }

  const attention = projectRows
    .map((p) => ({
      id: p.id, name: p.name, clientName: p.clientName, status: p.status,
      reasons: attentionReasons({ id: p.id, name: p.name, status: p.status, dueDate: p.dueDate, waitingOn: p.waitingOn, updatedAt: p.updatedAt, overdueTaskCount: overdueMap.get(p.id) ?? 0 }, today, now),
    }))
    .filter((p) => p.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length)
    .slice(0, 8);

  /* ---- tasks ---- */
  const todaysWork = myTasks
    .map((t) => ({
      ...t,
      overdue: Boolean(t.dueDate && t.dueDate < dayStart),
      dueToday: Boolean(t.dueDate && t.dueDate >= dayStart && t.dueDate < dayEnd),
      high: t.priority === "high" || t.priority === "urgent",
    }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(b.dueToday) - Number(a.dueToday) || Number(b.high) - Number(a.high))
    .slice(0, 8);

  const workload = workloadRows
    .map((w) => ({ assigneeId: w.assigneeId, name: w.name ?? "Unassigned", open: Number(w.open), overdue: Number(w.overdue), dueToday: Number(w.dueToday) }))
    .sort((a, b) => b.open - a.open);

  /* ---- client requests ---- */
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const reqCounts = {
    new: requestRows.filter((r) => r.status === "new").length,
    inProgress: requestRows.filter((r) => r.status === "triaged" || r.status === "in_progress").length,
    waiting: requestRows.filter((r) => r.status === "waiting").length,
    recentlyCompleted: requestRows.filter((r) => (r.status === "complete" || r.status === "client_notified") && r.updatedAt >= weekAgo).length,
  };
  const openRequests = requestRows.filter((r) => r.status !== "complete" && r.status !== "client_notified").slice(0, 6);

  /* ---- sales pipeline (Contractor Arsenal prospects only) ---- */
  const openStages = oppRows.filter((s) => !s.isWon && !s.isLost).map((s) => ({ stage: s.stage, count: Number(s.n), value: roundCents(toAmount(s.value)) }));

  /* ---- financial extras ---- */
  const expectedRecurring = roundCents(dueSubs.reduce((sum, s) => sum + toAmount(s.amount), 0));

  /* ---- upcoming (today / tomorrow / next 7 days) ---- */
  const tomorrow = addDaysStr(today, 1);
  const upcoming = calendar
    .map((e) => ({ id: e.id, kind: e.kind, title: e.title, date: e.displayDate, startTime: e.displayStartTime, allDay: e.allDay, clientName: e.clientName, taskId: e.taskId }))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.startTime ?? "").localeCompare(String(b.startTime ?? "")));
  const deadlines = projectRows
    .filter((p) => p.dueDate && p.dueDate >= today && p.dueDate <= addDaysStr(today, 7))
    .map((p) => ({ id: p.id, name: p.name, dueDate: p.dueDate as string, clientName: p.clientName }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return {
    today, tomorrow,
    stageCounts, waitingGroups, attention, todaysWork, workload,
    requests: { counts: reqCounts, open: openRequests },
    approvals: approvalRows,
    sales: { openLeads: Number(openLeadCount[0]?.n ?? 0), stages: openStages },
    clientLeads: {
      today: Number(clientLeadRow[0]?.today ?? 0), week: Number(clientLeadRow[0]?.week ?? 0),
      needsResponse: Number(clientLeadRow[0]?.needsResponse ?? 0),
    },
    financial: {
      paymentsThisWeek: roundCents(toAmount(weekPayments[0]?.sum ?? 0)),
      paymentCountThisWeek: Number(weekPayments[0]?.n ?? 0),
      expectedRecurring, dueSubscriptionCount: dueSubs.length,
    },
    upcoming, deadlines,
  };
}
export type DashboardOps = Awaited<ReturnType<typeof getDashboardOps>>;
