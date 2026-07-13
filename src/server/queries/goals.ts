import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessGoals, goalProgressUpdates, profiles } from "@/lib/db/schema";
import { todayInTimezone, zonedTimeToUtc, toDateOnlyString } from "@/lib/date-tz";
import {
  computeGoal, periodLabel, isManualMetric, addDaysStr,
  type GoalComputation, type GoalMetricType, type GoalPeriodType,
} from "@/lib/goals";
import { metricValueInPeriod } from "./goal-metrics";

export type GoalRow = typeof businessGoals.$inferSelect;

export type GoalWithProgress = {
  id: string;
  name: string;
  description: string | null;
  metricType: GoalMetricType;
  periodType: GoalPeriodType;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  targetValue: number;
  currentValue: number;
  isPrimary: boolean;
  status: "active" | "completed" | "archived";
  color: string | null;
  isManual: boolean;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  computation: GoalComputation;
};

/** Loads goal rows and attaches live progress: manual goals read their own
 * stored value; automatic goals aggregate real source records for the
 * goal's workspace-local period. */
async function withProgress(rows: GoalRow[], timezone: string): Promise<GoalWithProgress[]> {
  const today = todayInTimezone(timezone);
  return Promise.all(
    rows.map(async (g) => {
      const periodStart = toDateOnlyString(g.periodStart)!;
      const periodEnd = toDateOnlyString(g.periodEnd)!;
      const metricType = g.metricType as GoalMetricType;
      const manual = isManualMetric(metricType);
      const currentValue = manual
        ? Number(g.manualCurrentValue ?? 0)
        : await metricValueInPeriod(db, g.workspaceId, metricType, {
            start: zonedTimeToUtc(periodStart, "00:00", timezone),
            end: zonedTimeToUtc(addDaysStr(periodEnd, 1), "00:00", timezone),
          });
      const target = Number(g.targetValue);
      return {
        id: g.id,
        name: g.name,
        description: g.description,
        metricType,
        periodType: g.periodType as GoalPeriodType,
        periodStart,
        periodEnd,
        periodLabel: periodLabel(g.periodType as GoalPeriodType, { start: periodStart, end: periodEnd }),
        targetValue: target,
        currentValue,
        isPrimary: g.isPrimary,
        status: g.status,
        color: g.color,
        isManual: manual,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
        archivedAt: g.archivedAt,
        computation: computeGoal({ current: currentValue, target, periodStart, periodEnd, today }),
      };
    })
  );
}

/** All goals for the workspace, split into the Active view (active status,
 * period not yet over) and History (archived, completed, or period ended). */
export async function listGoals(workspaceId: string, timezone: string): Promise<{ active: GoalWithProgress[]; history: GoalWithProgress[] }> {
  const rows = await db
    .select()
    .from(businessGoals)
    .where(eq(businessGoals.workspaceId, workspaceId))
    .orderBy(asc(businessGoals.periodEnd), asc(businessGoals.createdAt), asc(businessGoals.id));
  const goals = await withProgress(rows, timezone);
  const active = goals.filter((g) => g.status === "active" && g.computation.periodState !== "ended");
  const history = goals
    .filter((g) => g.status !== "active" || g.computation.periodState === "ended")
    .sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : a.periodEnd > b.periodEnd ? -1 : 0));
  return { active, history };
}

export type GoalProgressUpdate = {
  id: string;
  previousValue: number;
  newValue: number;
  note: string | null;
  createdByName: string | null;
  createdAt: Date;
};

export async function getGoal(workspaceId: string, goalId: string, timezone: string): Promise<(GoalWithProgress & { progressUpdates: GoalProgressUpdate[] }) | null> {
  const [row] = await db
    .select()
    .from(businessGoals)
    .where(and(eq(businessGoals.id, goalId), eq(businessGoals.workspaceId, workspaceId)))
    .limit(1);
  if (!row) return null;
  const [goal] = await withProgress([row], timezone);
  const updates = await db
    .select({
      id: goalProgressUpdates.id,
      previousValue: goalProgressUpdates.previousValue,
      newValue: goalProgressUpdates.newValue,
      note: goalProgressUpdates.note,
      createdByName: profiles.name,
      createdAt: goalProgressUpdates.createdAt,
    })
    .from(goalProgressUpdates)
    .leftJoin(profiles, eq(goalProgressUpdates.createdBy, profiles.id))
    .where(and(eq(goalProgressUpdates.goalId, goalId), eq(goalProgressUpdates.workspaceId, workspaceId)))
    .orderBy(desc(goalProgressUpdates.createdAt))
    .limit(50);
  return {
    ...goal,
    progressUpdates: updates.map((u) => ({
      ...u,
      previousValue: Number(u.previousValue),
      newValue: Number(u.newValue),
    })),
  };
}

/**
 * Dashboard selection. The explicitly-flagged primary goal wins; otherwise
 * the fallback is the nearest active revenue goal — in-period goals first
 * (soonest period_end), then upcoming ones (soonest period_start) — with
 * created_at then id as deterministic tie-breakers. Never arbitrary order.
 */
export async function getDashboardGoals(workspaceId: string, timezone: string): Promise<{ primary: GoalWithProgress | null; others: GoalWithProgress[]; totalActive: number }> {
  const { active } = await listGoals(workspaceId, timezone);

  let primary = active.find((g) => g.isPrimary) ?? null;
  if (!primary) {
    const revenue = active.filter((g) => g.metricType === "revenue_collected");
    // `active` is ordered by period_end asc, created_at asc, id asc, so
    // .find() picks the in-period revenue goal ending soonest.
    const inPeriod = revenue.find((g) => g.computation.periodState === "active");
    const upcoming = [...revenue.filter((g) => g.computation.periodState === "upcoming")]
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart))[0];
    primary = inPeriod ?? upcoming ?? null;
  }

  const others = active.filter((g) => g.id !== primary?.id).slice(0, 4);
  return { primary, others, totalActive: active.length };
}
