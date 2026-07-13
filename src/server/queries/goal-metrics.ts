/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { payments, clients, leads, projects, tasks } from "@/lib/db/schema";
import type { GoalMetricType } from "@/lib/goals";

/**
 * Automatic goal-metric sources. Deliberately NOT "server-only" and
 * parameterized over the db handle so the PGlite integration tests can run
 * the exact same query builders the app runs in production.
 *
 * Semantics:
 * - revenue_collected: succeeded payments only (the same rule as
 *   isRevenuePayment in finance/metrics) — voided/pending/failed/refunded
 *   payments and expected subscription revenue never count. Attribution is
 *   by paid_at, matching the reports pages.
 * - new_clients: clients CREATED in the period. Archiving later does not
 *   erase the historical acquisition, so archived clients still count.
 * - new_leads: leads created in the period (same reasoning).
 * - projects_completed / tasks_completed: completed_at inside the period.
 *   Projects completed before this release predate the completed_at column
 *   and cannot be attributed to a period (documented limitation).
 *
 * Bounds are UTC instants for the workspace-local period: start inclusive,
 * end exclusive (the first instant of the day after the period ends).
 */
export type MetricDb = PgDatabase<any, any, any>;
export type UtcBounds = { start: Date; end: Date };

export async function metricValueInPeriod(
  db: MetricDb,
  workspaceId: string,
  metric: GoalMetricType,
  bounds: UtcBounds
): Promise<number> {
  switch (metric) {
    case "revenue_collected": {
      const [row] = await db
        .select({ total: sql<string>`coalesce(sum(${payments.amount}), 0)` })
        .from(payments)
        .where(and(
          eq(payments.workspaceId, workspaceId),
          eq(payments.status, "succeeded"),
          gte(payments.paidAt, bounds.start),
          lt(payments.paidAt, bounds.end)
        ));
      return Number(row?.total ?? 0);
    }
    case "new_clients": {
      const [row] = await db
        .select({ n: sql<string>`count(*)` })
        .from(clients)
        .where(and(eq(clients.workspaceId, workspaceId), gte(clients.createdAt, bounds.start), lt(clients.createdAt, bounds.end)));
      return Number(row?.n ?? 0);
    }
    case "new_leads": {
      const [row] = await db
        .select({ n: sql<string>`count(*)` })
        .from(leads)
        .where(and(eq(leads.workspaceId, workspaceId), gte(leads.createdAt, bounds.start), lt(leads.createdAt, bounds.end)));
      return Number(row?.n ?? 0);
    }
    case "projects_completed": {
      const [row] = await db
        .select({ n: sql<string>`count(*)` })
        .from(projects)
        .where(and(eq(projects.workspaceId, workspaceId), gte(projects.completedAt, bounds.start), lt(projects.completedAt, bounds.end)));
      return Number(row?.n ?? 0);
    }
    case "tasks_completed": {
      const [row] = await db
        .select({ n: sql<string>`count(*)` })
        .from(tasks)
        .where(and(eq(tasks.workspaceId, workspaceId), gte(tasks.completedAt, bounds.start), lt(tasks.completedAt, bounds.end)));
      return Number(row?.n ?? 0);
    }
    // Manual metrics never reach here — their value lives on the goal row.
    case "calls_completed":
    case "emails_sent":
    case "custom":
      return 0;
  }
}
