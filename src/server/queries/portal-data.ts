/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import {
  activityLogs, clientFiles, clientRequests, invoices, payments, profiles, projects,
  projectUpdates, services, subscriptions, tasks,
} from "@/lib/db/schema";
import { classifyWaitingOn, WAITING_ON_LABEL } from "@/lib/project-ops";
import { PORTAL_REQUEST_STATUS } from "@/lib/portal-request-status";
import { invoiceBalance, isPastDue, roundCents, toAmount } from "@/lib/finance/metrics";
import { calculateProjectProgress } from "@/lib/calendar-feed";

type Db = PgDatabase<any, any, any>;

/**
 * SECURITY BOUNDARY for the client portal.
 *
 * Every function here takes a PortalScope that the caller derives from the
 * SERVER-VERIFIED portal session (requireClientPortalUser → membership) —
 * never from the browser. Every query filters by BOTH workspaceId AND
 * clientId, selects only client-safe columns (never internal notes,
 * resolution notes, task titles that are not flagged client-visible, void
 * reasons, payment notes/references, etc.), and gates project-derived data
 * on projects.client_visible.
 */
export type PortalScope = { workspaceId: string; clientId: string };

/* ========== projects ========== */

const OPEN_STATUSES_EXCLUDED = ["closed"] as const;

function projectScope(scope: PortalScope) {
  return and(
    eq(projects.workspaceId, scope.workspaceId),
    eq(projects.clientId, scope.clientId),
    eq(projects.clientVisible, true),
    isNull(projects.archivedAt)
  );
}

/** What the client is told about who a project is waiting on. Free text is
 * only ever shown when it is genuinely waiting on the client; for any other
 * party the client only sees the party label, so internal phrasing never leaks. */
export function clientFacingWaitingOn(p: { status: string; waitingOn: string | null; waitingOnParty: string | null }) {
  const party = classifyWaitingOn(p);
  if (!party) return { party: null, label: null as string | null };
  if (party === "client") return { party, label: p.waitingOn?.trim() || "Your input" };
  return { party, label: party === "third_party" ? "A third party" : WAITING_ON_LABEL[party] };
}

export async function listPortalProjects(db: Db, scope: PortalScope) {
  const rows = await db
    .select({
      id: projects.id, name: projects.name, status: projects.status, summary: projects.clientSummary,
      startDate: projects.startDate, dueDate: projects.dueDate, waitingOn: projects.waitingOn,
      waitingOnParty: projects.waitingOnParty, nextAction: projects.nextAction,
      ownerName: profiles.name, updatedAt: projects.updatedAt,
    })
    .from(projects)
    .leftJoin(profiles, eq(projects.ownerId, profiles.id))
    .where(and(projectScope(scope), ne(projects.status, OPEN_STATUSES_EXCLUDED[0])))
    .orderBy(desc(projects.updatedAt));
  if (rows.length === 0) return [];

  const counts = await db
    .select({
      projectId: tasks.projectId,
      total: sql<number>`count(*)`,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')`,
    })
    .from(tasks)
    .where(and(
      eq(tasks.workspaceId, scope.workspaceId), eq(tasks.clientId, scope.clientId),
      eq(tasks.clientVisible, true), inArray(tasks.projectId, rows.map((r) => r.id))
    ))
    .groupBy(tasks.projectId);
  const byProject = new Map(counts.map((c) => [c.projectId as string, c]));

  return rows.map((p) => {
    const c = byProject.get(p.id);
    const total = c ? Number(c.total) : 0;
    const done = c ? Number(c.completed) : 0;
    const w = clientFacingWaitingOn(p);
    return {
      id: p.id, name: p.name, status: p.status, summary: p.summary, startDate: p.startDate, dueDate: p.dueDate,
      waitingOnParty: w.party, waitingOnLabel: w.label, nextAction: p.nextAction, ownerName: p.ownerName,
      updatedAt: p.updatedAt, checklistTotal: total, checklistDone: done,
      progress: calculateProjectProgress(total, done),
    };
  });
}

/** Null when the project doesn't exist, belongs to another client/workspace,
 * or is not client-visible — all three are indistinguishable to the caller. */
export async function getPortalProject(db: Db, scope: PortalScope, projectId: string) {
  const [p] = await db
    .select({
      id: projects.id, name: projects.name, status: projects.status, summary: projects.clientSummary,
      startDate: projects.startDate, dueDate: projects.dueDate, waitingOn: projects.waitingOn,
      waitingOnParty: projects.waitingOnParty, nextAction: projects.nextAction,
      ownerName: profiles.name, updatedAt: projects.updatedAt,
    })
    .from(projects)
    .leftJoin(profiles, eq(projects.ownerId, profiles.id))
    .where(and(projectScope(scope), eq(projects.id, projectId)))
    .limit(1);
  if (!p) return null;

  const [checklist, updates, files, requests] = await Promise.all([
    db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status, dueDate: tasks.dueDate })
      .from(tasks)
      .where(and(
        eq(tasks.workspaceId, scope.workspaceId), eq(tasks.clientId, scope.clientId),
        eq(tasks.projectId, projectId), eq(tasks.clientVisible, true)
      ))
      .orderBy(asc(tasks.createdAt)),
    db
      .select({ id: projectUpdates.id, body: projectUpdates.body, createdAt: projectUpdates.createdAt })
      .from(projectUpdates)
      .where(and(
        eq(projectUpdates.workspaceId, scope.workspaceId), eq(projectUpdates.projectId, projectId),
        eq(projectUpdates.clientVisible, true)
      ))
      .orderBy(desc(projectUpdates.createdAt))
      .limit(20),
    listPortalFiles(db, scope, projectId),
    db
      .select({
        id: clientRequests.id, type: clientRequests.type, status: clientRequests.status,
        description: clientRequests.description, createdAt: clientRequests.createdAt, clientUpdate: clientRequests.clientUpdate,
      })
      .from(clientRequests)
      .where(and(
        eq(clientRequests.workspaceId, scope.workspaceId), eq(clientRequests.clientId, scope.clientId),
        eq(clientRequests.projectId, projectId)
      ))
      .orderBy(desc(clientRequests.createdAt))
      .limit(10),
  ]);

  const done = checklist.filter((t) => t.status === "completed").length;
  const w = clientFacingWaitingOn(p);
  return {
    id: p.id, name: p.name, status: p.status, summary: p.summary, startDate: p.startDate, dueDate: p.dueDate,
    waitingOnParty: w.party, waitingOnLabel: w.label, nextAction: p.nextAction, ownerName: p.ownerName,
    updatedAt: p.updatedAt, progress: calculateProjectProgress(checklist.length, done),
    checklist, updates, files, requests,
  };
}

/* ========== requests ========== */

/** Client-safe request list: internal resolutionNotes, linked internal task
 * titles, and staff identities are never selected. */
export async function listPortalRequests(db: Db, scope: PortalScope) {
  return db
    .select({
      id: clientRequests.id, type: clientRequests.type, status: clientRequests.status,
      description: clientRequests.description, priority: clientRequests.priority,
      createdAt: clientRequests.createdAt, updatedAt: clientRequests.updatedAt,
      clientUpdate: clientRequests.clientUpdate, projectId: clientRequests.projectId,
      projectName: projects.name,
    })
    .from(clientRequests)
    .leftJoin(projects, and(
      eq(clientRequests.projectId, projects.id), eq(projects.clientVisible, true), eq(projects.clientId, scope.clientId)
    ))
    .where(and(eq(clientRequests.workspaceId, scope.workspaceId), eq(clientRequests.clientId, scope.clientId)))
    .orderBy(desc(clientRequests.createdAt));
}
export type PortalRequestRow = Awaited<ReturnType<typeof listPortalRequests>>[number];


/* ========== files ========== */

export async function listPortalFiles(db: Db, scope: PortalScope, projectId?: string) {
  const conditions = [
    eq(clientFiles.workspaceId, scope.workspaceId), eq(clientFiles.clientId, scope.clientId),
    eq(clientFiles.status, "ready"), isNull(clientFiles.archivedAt),
  ];
  if (projectId) conditions.push(eq(clientFiles.projectId, projectId));
  return db
    .select({
      id: clientFiles.id, name: clientFiles.name, sizeBytes: clientFiles.sizeBytes, mimeType: clientFiles.mimeType,
      category: clientFiles.category, projectId: clientFiles.projectId, uploadedByClient: clientFiles.uploadedByClient,
      createdAt: clientFiles.createdAt,
    })
    .from(clientFiles)
    .where(and(...conditions))
    .orderBy(desc(clientFiles.createdAt));
}
export type PortalFileRow = Awaited<ReturnType<typeof listPortalFiles>>[number];

/* ========== billing ========== */

export async function getPortalBilling(db: Db, scope: PortalScope) {
  const [subs, invs, pays] = await Promise.all([
    db
      .select({
        id: subscriptions.id, serviceName: services.name, amount: subscriptions.amount,
        frequency: subscriptions.frequency, status: subscriptions.status, startDate: subscriptions.startDate,
        nextBillingDate: subscriptions.nextBillingDate,
      })
      .from(subscriptions)
      .innerJoin(services, eq(subscriptions.serviceId, services.id))
      .where(and(eq(subscriptions.workspaceId, scope.workspaceId), eq(subscriptions.clientId, scope.clientId)))
      .orderBy(desc(subscriptions.createdAt)),
    db
      .select({
        id: invoices.id, number: invoices.number, status: invoices.status, total: invoices.total,
        amountPaid: invoices.amountPaid, issueDate: invoices.issueDate, dueDate: invoices.dueDate,
      })
      .from(invoices)
      .where(and(
        eq(invoices.workspaceId, scope.workspaceId), eq(invoices.clientId, scope.clientId),
        inArray(invoices.status, ["open", "paid", "past_due"])
      ))
      .orderBy(desc(invoices.createdAt)),
    db
      .select({
        id: payments.id, amount: payments.amount, status: payments.status, method: payments.method,
        paymentType: payments.paymentType, billingMonth: payments.billingMonth, paidAt: payments.paidAt,
      })
      .from(payments)
      .where(and(
        eq(payments.workspaceId, scope.workspaceId), eq(payments.clientId, scope.clientId),
        inArray(payments.status, ["succeeded", "pending", "refunded"])
      ))
      .orderBy(desc(payments.paidAt))
      .limit(100),
  ]);

  const unpaid = invs.filter((i) => i.status === "open" || i.status === "past_due");
  const outstanding = roundCents(unpaid.reduce((sum, i) => sum + invoiceBalance(i), 0));
  const pastDue = roundCents(unpaid.filter((i) => isPastDue(i)).reduce((sum, i) => sum + invoiceBalance(i), 0));
  const paidTotal = roundCents(pays.filter((p) => p.status === "succeeded").reduce((sum, p) => sum + toAmount(p.amount), 0));
  return { subscriptions: subs, invoices: invs, payments: pays, outstanding, pastDue, paidTotal };
}

/* ========== activity ========== */

const CLIENT_SAFE_ACTIVITY = [
  "client_request.created", "client_request.status_changed", "client_lead.created",
  "payment.recorded", "project.update_posted", "project.stage_changed",
] as const;

/** Meaningful, client-safe activity only (allowlist). Project events are
 * shown only for client-visible projects; staff identities are collapsed to
 * "Contractor Arsenal". */
export async function listPortalActivity(db: Db, scope: PortalScope, viewerProfileId: string | null, limit = 12) {
  const visibleProjects = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(projectScope(scope));
  const projectName = new Map(visibleProjects.map((p) => [p.id, p.name]));

  const rows = await db
    .select({
      id: activityLogs.id, action: activityLogs.action, entityId: activityLogs.entityId, actorId: activityLogs.actorId,
      metadata: activityLogs.metadata, createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .where(and(
      eq(activityLogs.workspaceId, scope.workspaceId), eq(activityLogs.clientId, scope.clientId),
      inArray(activityLogs.action, [...CLIENT_SAFE_ACTIVITY])
    ))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit * 4);

  const out: { id: string; text: string; at: Date }[] = [];
  for (const r of rows) {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const who = viewerProfileId && r.actorId === viewerProfileId ? "You" : "Contractor Arsenal";
    let text: string | null = null;
    switch (r.action) {
      case "client_request.created": text = `${who === "You" ? "You" : "A team member"} submitted a request`; break;
      case "client_request.status_changed": text = "A request was updated"; break;
      case "client_lead.created": text = "New website lead received"; break;
      case "payment.recorded": text = "Payment recorded"; break;
      case "project.update_posted": {
        if (meta.clientVisible !== true) break;
        const name = r.entityId ? projectName.get(r.entityId) : null;
        if (name) text = `Update posted on ${name}`;
        break;
      }
      case "project.stage_changed": {
        const name = r.entityId ? projectName.get(r.entityId) : null;
        if (name) text = `${name} moved to a new stage`;
        break;
      }
    }
    if (text) out.push({ id: r.id, text, at: r.createdAt });
    if (out.length >= limit) break;
  }
  return out;
}

/* ========== dashboard ========== */

export async function getPortalDashboard(db: Db, scope: PortalScope, todayYmd: string, viewerProfileId: string | null) {
  const [projectRows, requests, billing, files, activity] = await Promise.all([
    listPortalProjects(db, scope),
    listPortalRequests(db, scope),
    getPortalBilling(db, scope),
    listPortalFiles(db, scope),
    listPortalActivity(db, scope, viewerProfileId),
  ]);

  const active = projectRows.filter((p) => p.status !== "live" && p.status !== "paused");
  const waitingOnYou = projectRows.filter((p) => p.waitingOnParty === "client");
  const nextActions = projectRows.filter((p) => p.nextAction).map((p) => ({ projectId: p.id, projectName: p.name, action: p.nextAction as string }));

  // Upcoming = real, client-visible dates only: project target dates and
  // client-visible checklist due dates in the next 30 days.
  const horizon = new Date(`${todayYmd}T12:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 30);
  const horizonYmd = horizon.toISOString().slice(0, 10);
  const upcoming: { date: string; label: string; projectId: string | null }[] = [];
  for (const p of projectRows) {
    if (p.dueDate && p.dueDate >= todayYmd && p.dueDate <= horizonYmd) {
      upcoming.push({ date: p.dueDate, label: `${p.name} — target date`, projectId: p.id });
    }
  }
  const checklistDue = await db
    .select({ title: tasks.title, dueDate: tasks.dueDate, projectId: tasks.projectId })
    .from(tasks)
    .where(and(
      eq(tasks.workspaceId, scope.workspaceId), eq(tasks.clientId, scope.clientId), eq(tasks.clientVisible, true),
      ne(tasks.status, "completed"), ne(tasks.status, "canceled"),
      gte(tasks.dueDate, new Date(`${todayYmd}T00:00:00Z`))
    ))
    .orderBy(asc(tasks.dueDate))
    .limit(20);
  for (const t of checklistDue) {
    if (!t.dueDate) continue;
    const ymd = t.dueDate.toISOString().slice(0, 10);
    if (ymd <= horizonYmd) upcoming.push({ date: ymd, label: t.title, projectId: t.projectId });
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  return {
    activeProjects: active,
    allProjects: projectRows,
    waitingOnYou,
    nextActions,
    recentRequests: requests.slice(0, 5),
    openRequestCount: requests.filter((r) => !(PORTAL_REQUEST_STATUS[r.status]?.done)).length,
    billing,
    fileCount: files.length,
    upcoming: upcoming.slice(0, 8),
    activity,
  };
}
