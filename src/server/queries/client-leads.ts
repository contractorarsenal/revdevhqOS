/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { leads } from "@/lib/db/schema";
import { weekPeriodContaining, monthPeriod, addDaysStr } from "@/lib/goals";
import { zonedTimeToUtc } from "@/lib/date-tz";

/**
 * Client-scoped lead performance summary. db-parameterized (like
 * goal-metrics) so PGlite integration tests run the exact production query
 * builders. Semantics:
 * - Only leads linked to the client via leads.client_id count.
 * - Archived leads (archived_at set) are EXCLUDED from every number — the
 *   summary reflects the live lead book, not historical soft-deletes.
 * - "Won" maps to status=converted; "Lost" to status=lost. qualified /
 *   unqualified are folded into "open" alongside new/contacted.
 * - Weeks are Monday–Sunday in the workspace timezone.
 */
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

type Db = PgDatabase<any, any, any>;

export async function clientLeadSummary(
  db: Db,
  workspaceId: string,
  clientId: string,
  timezone: string,
  today: string
): Promise<ClientLeadSummary> {
  const scope = and(
    eq(leads.workspaceId, workspaceId),
    eq(leads.clientId, clientId),
    isNull(leads.archivedAt)
  );

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
      thisWeek: sql<string>`count(*) FILTER (WHERE ${leads.createdAt} >= ${weekStart} AND ${leads.createdAt} < ${weekEnd})`,
      thisMonth: sql<string>`count(*) FILTER (WHERE ${leads.createdAt} >= ${monthStart} AND ${leads.createdAt} < ${monthEnd})`,
      newCount: sql<string>`count(*) FILTER (WHERE ${leads.status} = 'new')`,
      contacted: sql<string>`count(*) FILTER (WHERE ${leads.status} = 'contacted')`,
      won: sql<string>`count(*) FILTER (WHERE ${leads.status} = 'converted')`,
      lost: sql<string>`count(*) FILTER (WHERE ${leads.status} = 'lost')`,
      pipelineValue: sql<string | null>`sum(${leads.estimatedValue})`,
      firstLeadAt: sql<string | null>`min(${leads.createdAt})`,
    })
    .from(leads)
    .where(scope);

  const total = Number(row?.total ?? 0);
  const firstLeadAt = row?.firstLeadAt ? new Date(row.firstLeadAt) : null;
  // Average per month over the span from the first lead to today (calendar
  // months, minimum 1) — a client 10 days old with 5 leads averages 5/month.
  let avgPerMonth = 0;
  if (total > 0 && firstLeadAt) {
    const [ty, tm] = today.split("-").map(Number);
    const months =
      (ty - firstLeadAt.getUTCFullYear()) * 12 + (tm - (firstLeadAt.getUTCMonth() + 1)) + 1;
    avgPerMonth = total / Math.max(1, months);
  }

  return {
    total,
    thisWeek: Number(row?.thisWeek ?? 0),
    thisMonth: Number(row?.thisMonth ?? 0),
    avgPerMonth: Math.round(avgPerMonth * 10) / 10,
    newCount: Number(row?.newCount ?? 0),
    contacted: Number(row?.contacted ?? 0),
    won: Number(row?.won ?? 0),
    lost: Number(row?.lost ?? 0),
    pipelineValue: row?.pipelineValue != null ? Number(row.pipelineValue) : null,
    firstLeadAt,
  };
}
