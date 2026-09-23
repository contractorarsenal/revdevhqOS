/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { clientLeads, profiles, clientPortalMemberships } from "@/lib/db/schema";
import { weekPeriodContaining, monthPeriod, addDaysStr } from "@/lib/goals";
import { zonedTimeToUtc } from "@/lib/date-tz";
import type { ClientLeadStatus } from "@/lib/leads-client";
import type { ClientPortalRole } from "@/lib/portal";

type Db = PgDatabase<any, any, any>;

/* ========== list / detail ========== */

const CLIENT_LEAD_COLUMNS = {
  id: clientLeads.id,
  name: clientLeads.name,
  email: clientLeads.email,
  phone: clientLeads.phone,
  requestedService: clientLeads.requestedService,
  source: clientLeads.source,
  status: clientLeads.status,
  receivedOn: clientLeads.receivedOn,
  receivedAt: clientLeads.receivedAt,
  contactedAt: clientLeads.lastContactedAt,
  estimateScheduledAt: clientLeads.estimateScheduledAt,
  wonAt: clientLeads.wonAt,
  lostAt: clientLeads.lostAt,
  estimatedValue: clientLeads.estimatedValue,
  closedValue: clientLeads.closedValue,
  assignedToId: clientLeads.ownerId,
  assignedToName: profiles.name,
  notes: clientLeads.notes,
  createdAt: clientLeads.createdAt,
  updatedAt: clientLeads.updatedAt,
} as const;

export type ClientLeadRow = Awaited<ReturnType<typeof listClientLeads>>[number];

export type ClientLeadFilters = {
  search?: string;
  status?: ClientLeadStatus;
  assignedTo?: string | "unassigned";
  source?: string;
  sort?: "newest" | "oldest" | "highest_value";
};

/** Every lead FOR this client, scoped by (workspaceId, clientId) together —
 * never one alone — and excluding archived leads. This is the single
 * client-scoped list query the portal and the internal client-leads page
 * both read from. */
export async function listClientLeads(db: Db, workspaceId: string, clientId: string, filters: ClientLeadFilters = {}) {
  const conditions = [eq(clientLeads.workspaceId, workspaceId), eq(clientLeads.clientId, clientId), isNull(clientLeads.archivedAt)];
  if (filters.status) conditions.push(eq(clientLeads.status, filters.status));
  if (filters.source) conditions.push(eq(clientLeads.source, filters.source));
  if (filters.assignedTo === "unassigned") conditions.push(isNull(clientLeads.ownerId));
  else if (filters.assignedTo) conditions.push(eq(clientLeads.ownerId, filters.assignedTo));
  if (filters.search) {
    const term = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        sql`lower(coalesce(${clientLeads.name}, '')) like ${term}`,
        sql`lower(coalesce(${clientLeads.email}, '')) like ${term}`,
        sql`coalesce(${clientLeads.phone}, '') like ${term}`
      )!
    );
  }

  const orderBy =
    filters.sort === "oldest" ? asc(clientLeads.receivedAt)
    : filters.sort === "highest_value" ? desc(sql`coalesce(${clientLeads.estimatedValue}, 0)`)
    : desc(clientLeads.receivedAt);

  return db
    .select(CLIENT_LEAD_COLUMNS)
    .from(clientLeads)
    .leftJoin(profiles, eq(clientLeads.ownerId, profiles.id))
    .where(and(...conditions))
    .orderBy(orderBy);
}

/** A single client-generated lead, scoped by (workspaceId, clientId, leadId)
 * together — the query itself makes cross-client access structurally
 * impossible: a leadId belonging to another client simply matches no row. */
export async function getClientLead(db: Db, workspaceId: string, clientId: string, leadId: string) {
  const [row] = await db
    .select(CLIENT_LEAD_COLUMNS)
    .from(clientLeads)
    .leftJoin(profiles, eq(clientLeads.ownerId, profiles.id))
    .where(and(eq(clientLeads.id, leadId), eq(clientLeads.workspaceId, workspaceId), eq(clientLeads.clientId, clientId), isNull(clientLeads.archivedAt)))
    .limit(1);
  return row ?? null;
}

/** Internal-only variant of getClientLead: same scope, but also returns
 * internalNotes — never call this for a portal-facing response. */
export async function getClientLeadInternal(db: Db, workspaceId: string, clientId: string, leadId: string) {
  const [row] = await db
    .select({ ...CLIENT_LEAD_COLUMNS, internalNotes: clientLeads.internalNotes })
    .from(clientLeads)
    .leftJoin(profiles, eq(clientLeads.ownerId, profiles.id))
    .where(and(eq(clientLeads.id, leadId), eq(clientLeads.workspaceId, workspaceId), eq(clientLeads.clientId, clientId), isNull(clientLeads.archivedAt)))
    .limit(1);
  return row ?? null;
}

/* ========== eligible assignees ========== */

export type EligibleAssignee = { profileId: string; name: string; role: ClientPortalRole };

/** Active client_owner/client_member portal members for this client —
 * client_read_only is excluded since they cannot manage leads and would
 * make an odd "responsible party". Used by the Assigned To selector on
 * both the portal and internal side. */
export async function listEligibleAssignees(db: Db, workspaceId: string, clientId: string): Promise<EligibleAssignee[]> {
  return db
    .select({ profileId: clientPortalMemberships.profileId, name: profiles.name, role: clientPortalMemberships.role })
    .from(clientPortalMemberships)
    .innerJoin(profiles, eq(clientPortalMemberships.profileId, profiles.id))
    .where(and(
      eq(clientPortalMemberships.workspaceId, workspaceId),
      eq(clientPortalMemberships.clientId, clientId),
      eq(clientPortalMemberships.status, "active"),
      inArray(clientPortalMemberships.role, ["client_owner", "client_member"])
    ));
}

/* ========== metrics ========== */

export type ClientLeadMetrics = {
  leadsThisWeek: number;
  leadsThisMonth: number;
  totalLeads: number;
  /** Leads per calendar month, averaged over the span from the first lead's
   * receivedAt to today (minimum 1 month) — a client 10 days old with 5
   * leads averages 5/month, not a fraction of a month. */
  avgLeadsPerMonth: number;
  newCount: number;
  /** status = "new" AND never contacted — see lib/leads-client.isNeedsResponse. */
  needsResponse: number;
  contacted: number;
  estimateScheduled: number;
  won: number;
  lost: number;
  /** Sum of estimatedValue across open leads (new/contacted/estimate_scheduled) only. */
  estimatedPipelineValue: number;
  /** Sum of closedValue for WON leads only — never claims revenue the
   * client hasn't explicitly confirmed by marking a lead won with a value. */
  confirmedRevenue: number;
  firstLeadAt: Date | null;
};

/**
 * Client-scoped, workspace-scoped, timezone-correct lead metrics. Weeks are
 * Monday–Sunday; months are calendar months; both computed in the
 * workspace's timezone (never UTC slicing) via zonedTimeToUtc. Archived
 * leads are excluded from every number.
 */
export async function getClientLeadMetrics(
  db: Db,
  workspaceId: string,
  clientId: string,
  timezone: string,
  today: string
): Promise<ClientLeadMetrics> {
  const scope = and(eq(clientLeads.workspaceId, workspaceId), eq(clientLeads.clientId, clientId), isNull(clientLeads.archivedAt));

  const week = weekPeriodContaining(today);
  const [y, m] = today.split("-").map(Number);
  const month = monthPeriod(y, m);
  const weekStart = zonedTimeToUtc(week.start, "00:00", timezone);
  const weekEnd = zonedTimeToUtc(addDaysStr(week.end, 1), "00:00", timezone);
  const monthStart = zonedTimeToUtc(month.start, "00:00", timezone);
  const monthEnd = zonedTimeToUtc(addDaysStr(month.end, 1), "00:00", timezone);

  const [row] = await db
    .select({
      total: sql<string>`count(*)`,
      thisWeek: sql<string>`count(*) FILTER (WHERE ${clientLeads.receivedAt} >= ${weekStart} AND ${clientLeads.receivedAt} < ${weekEnd})`,
      thisMonth: sql<string>`count(*) FILTER (WHERE ${clientLeads.receivedAt} >= ${monthStart} AND ${clientLeads.receivedAt} < ${monthEnd})`,
      newCount: sql<string>`count(*) FILTER (WHERE ${clientLeads.status} = 'new')`,
      needsResponse: sql<string>`count(*) FILTER (WHERE ${clientLeads.status} = 'new' AND ${clientLeads.lastContactedAt} IS NULL)`,
      contacted: sql<string>`count(*) FILTER (WHERE ${clientLeads.status} = 'contacted')`,
      estimateScheduled: sql<string>`count(*) FILTER (WHERE ${clientLeads.status} = 'estimate_scheduled')`,
      won: sql<string>`count(*) FILTER (WHERE ${clientLeads.status} = 'won')`,
      lost: sql<string>`count(*) FILTER (WHERE ${clientLeads.status} = 'lost')`,
      estimatedPipelineValue: sql<string | null>`sum(${clientLeads.estimatedValue}) FILTER (WHERE ${clientLeads.status} IN ('new','contacted','estimate_scheduled'))`,
      confirmedRevenue: sql<string | null>`sum(${clientLeads.closedValue}) FILTER (WHERE ${clientLeads.status} = 'won')`,
      firstLeadAt: sql<string | null>`min(${clientLeads.receivedAt})`,
    })
    .from(clientLeads)
    .where(scope);

  const totalLeads = Number(row?.total ?? 0);
  const firstLeadAt = row?.firstLeadAt ? new Date(row.firstLeadAt) : null;
  let avgLeadsPerMonth = 0;
  if (totalLeads > 0 && firstLeadAt) {
    const [ty, tm] = today.split("-").map(Number);
    const months = (ty - firstLeadAt.getUTCFullYear()) * 12 + (tm - (firstLeadAt.getUTCMonth() + 1)) + 1;
    avgLeadsPerMonth = totalLeads / Math.max(1, months);
  }

  return {
    leadsThisWeek: Number(row?.thisWeek ?? 0),
    leadsThisMonth: Number(row?.thisMonth ?? 0),
    totalLeads,
    avgLeadsPerMonth: Math.round(avgLeadsPerMonth * 10) / 10,
    newCount: Number(row?.newCount ?? 0),
    needsResponse: Number(row?.needsResponse ?? 0),
    contacted: Number(row?.contacted ?? 0),
    estimateScheduled: Number(row?.estimateScheduled ?? 0),
    won: Number(row?.won ?? 0),
    lost: Number(row?.lost ?? 0),
    estimatedPipelineValue: row?.estimatedPipelineValue != null ? Number(row.estimatedPipelineValue) : 0,
    confirmedRevenue: row?.confirmedRevenue != null ? Number(row.confirmedRevenue) : 0,
    firstLeadAt,
  };
}

/* ========== legacy summary (internal "Leads Performance" card) ========== */

export type ClientLeadSummary = {
  total: number;
  thisWeek: number;
  thisMonth: number;
  avgPerMonth: number;
  newCount: number;
  contacted: number;
  won: number;
  lost: number;
  pipelineValue: number | null;
  firstLeadAt: Date | null;
};

/** Thin adapter over getClientLeadMetrics for the existing internal
 * ClientLeadSummaryCard shape — kept so that card's status counting can
 * never drift from the authoritative metrics function. */
export async function clientLeadSummary(
  db: Db,
  workspaceId: string,
  clientId: string,
  timezone: string,
  today: string
): Promise<ClientLeadSummary> {
  const m = await getClientLeadMetrics(db, workspaceId, clientId, timezone, today);
  return {
    total: m.totalLeads,
    thisWeek: m.leadsThisWeek,
    thisMonth: m.leadsThisMonth,
    avgPerMonth: m.avgLeadsPerMonth,
    newCount: m.newCount,
    contacted: m.contacted,
    won: m.won,
    lost: m.lost,
    pipelineValue: m.totalLeads > 0 ? m.estimatedPipelineValue : null,
    firstLeadAt: m.firstLeadAt,
  };
}
