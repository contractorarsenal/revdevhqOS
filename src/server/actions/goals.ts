"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessGoals, goalProgressUpdates } from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { goalSchema, goalProgressSchema } from "@/lib/validation";
import { resolvePeriod, nextPeriod, isManualMetric, type GoalPeriodType } from "@/lib/goals";
import { toDateOnlyString } from "@/lib/date-tz";
import { logActivity } from "@/server/activity";

/** Goals are managed by owners and admins only (viewing follows normal
 * dashboard access). authorize("admin") passes for owner + admin roles. */
const MANAGE_ROLE = "admin" as const;

async function ownedGoal(workspaceId: string, goalId: string) {
  const [row] = await db
    .select()
    .from(businessGoals)
    .where(and(eq(businessGoals.id, goalId), eq(businessGoals.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Goal not found in this workspace.");
  return row;
}

function revalidateGoals(goalId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/goals");
  if (goalId) revalidatePath(`/goals/${goalId}`);
}

export async function createGoal(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorize(MANAGE_ROLE);
    const data = goalSchema.parse(input);
    const period = resolvePeriod(data);
    const manual = isManualMetric(data.metricType);

    const id = await db.transaction(async (tx) => {
      if (data.isPrimary) {
        await tx.update(businessGoals).set({ isPrimary: false })
          .where(and(eq(businessGoals.workspaceId, ctx.workspace.id), eq(businessGoals.isPrimary, true)));
      }
      const [row] = await tx
        .insert(businessGoals)
        .values({
          workspaceId: ctx.workspace.id,
          name: data.name,
          description: data.description ?? null,
          metricType: data.metricType,
          periodType: data.periodType,
          targetValue: String(data.targetValue),
          manualCurrentValue: manual ? String(data.manualStartValue ?? 0) : null,
          periodStart: period.start,
          periodEnd: period.end,
          isPrimary: data.isPrimary,
          color: data.color ?? null,
          createdBy: ctx.user.id,
        })
        .returning();
      return row.id;
    });

    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "goal.created", entityType: "goal", entityId: id,
      metadata: { name: data.name, metricType: data.metricType, target: data.targetValue },
    });
    revalidateGoals();
    return { ok: true, data: { id } };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateGoal(goalId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize(MANAGE_ROLE);
    const existing = await ownedGoal(ctx.workspace.id, goalId);
    if (existing.status === "archived") throw new Error("Archived goals cannot be edited.");
    const data = goalSchema.parse(input);
    const period = resolvePeriod(data);
    const manual = isManualMetric(data.metricType);

    await db.transaction(async (tx) => {
      if (data.isPrimary && !existing.isPrimary) {
        await tx.update(businessGoals).set({ isPrimary: false })
          .where(and(eq(businessGoals.workspaceId, ctx.workspace.id), eq(businessGoals.isPrimary, true)));
      }
      await tx
        .update(businessGoals)
        .set({
          name: data.name,
          description: data.description ?? null,
          metricType: data.metricType,
          periodType: data.periodType,
          targetValue: String(data.targetValue),
          // Switching to a manual metric starts its counter; switching away clears it.
          manualCurrentValue: manual ? existing.manualCurrentValue ?? String(data.manualStartValue ?? 0) : null,
          periodStart: period.start,
          periodEnd: period.end,
          isPrimary: data.isPrimary,
          color: data.color ?? null,
        })
        .where(eq(businessGoals.id, goalId));
    });

    revalidateGoals(goalId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/** Simple progress update for manual metrics (calls, emails, custom) —
 * records an audit row so the detail view can show the trail. */
export async function updateGoalProgress(goalId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize(MANAGE_ROLE);
    const existing = await ownedGoal(ctx.workspace.id, goalId);
    if (existing.status === "archived") throw new Error("Archived goals cannot be updated.");
    if (!isManualMetric(existing.metricType)) {
      throw new Error("This goal's progress is calculated automatically from real records.");
    }
    const data = goalProgressSchema.parse(input);

    await db.transaction(async (tx) => {
      await tx
        .update(businessGoals)
        .set({ manualCurrentValue: String(data.value) })
        .where(eq(businessGoals.id, goalId));
      await tx.insert(goalProgressUpdates).values({
        workspaceId: ctx.workspace.id,
        goalId,
        previousValue: existing.manualCurrentValue ?? "0",
        newValue: String(data.value),
        note: data.note ?? null,
        createdBy: ctx.user.id,
      });
    });

    revalidateGoals(goalId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/** Makes one active goal the primary dashboard goal; the partial unique
 * index (workspace_id where is_primary) backs this transactionally. */
export async function setGoalPrimary(goalId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize(MANAGE_ROLE);
    const existing = await ownedGoal(ctx.workspace.id, goalId);
    if (existing.status !== "active") throw new Error("Only active goals can be made primary.");

    await db.transaction(async (tx) => {
      await tx.update(businessGoals).set({ isPrimary: false })
        .where(and(eq(businessGoals.workspaceId, ctx.workspace.id), eq(businessGoals.isPrimary, true), ne(businessGoals.id, goalId)));
      await tx.update(businessGoals).set({ isPrimary: true }).where(eq(businessGoals.id, goalId));
    });

    revalidateGoals(goalId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/** Soft-archive: the goal keeps its final values and stays in History. */
export async function archiveGoal(goalId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize(MANAGE_ROLE);
    const existing = await ownedGoal(ctx.workspace.id, goalId);
    if (existing.status === "archived") return { ok: true };

    await db
      .update(businessGoals)
      .set({ status: "archived", archivedAt: new Date(), isPrimary: false })
      .where(eq(businessGoals.id, goalId));

    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "goal.archived", entityType: "goal", entityId: goalId,
      metadata: { name: existing.name },
    });
    revalidateGoals(goalId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/** Creates a fresh goal for the immediately-following period, leaving the
 * source goal and its history untouched. */
export async function duplicateGoalForNextPeriod(goalId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorize(MANAGE_ROLE);
    const existing = await ownedGoal(ctx.workspace.id, goalId);
    const start = toDateOnlyString(existing.periodStart)!;
    const end = toDateOnlyString(existing.periodEnd)!;
    const next = nextPeriod(existing.periodType as GoalPeriodType, { start, end });

    const [row] = await db
      .insert(businessGoals)
      .values({
        workspaceId: ctx.workspace.id,
        name: existing.name,
        description: existing.description,
        metricType: existing.metricType,
        periodType: existing.periodType,
        targetValue: existing.targetValue,
        manualCurrentValue: isManualMetric(existing.metricType) ? "0" : null,
        periodStart: next.start,
        periodEnd: next.end,
        isPrimary: false,
        color: existing.color,
        createdBy: ctx.user.id,
      })
      .returning();

    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "goal.created", entityType: "goal", entityId: row.id,
      metadata: { name: existing.name, duplicatedFrom: goalId },
    });
    revalidateGoals();
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    return actionError(err);
  }
}
