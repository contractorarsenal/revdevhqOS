"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarEvents } from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { assertWorkspaceClient, assertWorkspaceTask, assertWorkspaceMember } from "@/server/workspace-guards";
import { calendarEventSchema } from "@/lib/validation";
import { zonedTimeToUtc } from "@/lib/date-tz";
import { logActivity } from "@/server/activity";

/**
 * Converts the event's local wall-clock date/time into the correct UTC
 * instants, using the workspace's timezone — never the server process's
 * own timezone (which is UTC in production and would silently corrupt
 * every event's time by the workspace's UTC offset).
 */
function toRange(date: string, startTime: string, endTime: string, timezone: string, allDay: boolean) {
  if (allDay) {
    const startAt = zonedTimeToUtc(date, "00:00", timezone);
    const endAt = zonedTimeToUtc(date, "23:59", timezone);
    return { startAt, endAt };
  }
  const startAt = zonedTimeToUtc(date, startTime, timezone);
  const endAt = zonedTimeToUtc(date, endTime, timezone);
  return { startAt, endAt };
}

async function ownedEvent(workspaceId: string, eventId: string) {
  const [row] = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Calendar event not found in this workspace.");
  return row;
}

export async function createCalendarEvent(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorize("member");
    const data = calendarEventSchema.parse(input);
    await assertWorkspaceClient(ctx.workspace.id, data.clientId);
    await assertWorkspaceTask(ctx.workspace.id, data.taskId);
    await assertWorkspaceMember(ctx.workspace.id, data.assigneeId);
    const { startAt, endAt } = toRange(data.date, data.startTime, data.endTime, ctx.workspace.timezone, data.allDay);
    if (endAt <= startAt) throw new Error("End time must be after start time.");

    const [row] = await db
      .insert(calendarEvents)
      .values({
        workspaceId: ctx.workspace.id,
        title: data.title,
        clientId: data.clientId ?? null,
        taskId: data.taskId ?? null,
        assigneeId: data.assigneeId ?? null,
        startAt, endAt,
        allDay: data.allDay,
        color: data.color ?? null,
        notes: data.notes ?? null,
        status: data.status,
        createdBy: ctx.user.id,
      })
      .returning();

    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "calendar_event.created", entityType: "calendar_event", entityId: row.id, clientId: data.clientId ?? null,
      metadata: { title: data.title },
    });
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    if (data.clientId) revalidatePath(`/clients/${data.clientId}`);
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateCalendarEvent(eventId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    const existing = await ownedEvent(ctx.workspace.id, eventId);
    const data = calendarEventSchema.parse(input);
    await assertWorkspaceClient(ctx.workspace.id, data.clientId);
    await assertWorkspaceTask(ctx.workspace.id, data.taskId);
    await assertWorkspaceMember(ctx.workspace.id, data.assigneeId);
    const { startAt, endAt } = toRange(data.date, data.startTime, data.endTime, ctx.workspace.timezone, data.allDay);
    if (endAt <= startAt) throw new Error("End time must be after start time.");

    await db
      .update(calendarEvents)
      .set({
        title: data.title,
        clientId: data.clientId ?? null,
        taskId: data.taskId ?? null,
        assigneeId: data.assigneeId ?? null,
        startAt, endAt,
        allDay: data.allDay,
        color: data.color ?? null,
        notes: data.notes ?? null,
        status: data.status,
      })
      .where(eq(calendarEvents.id, eventId));

    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    if (existing.clientId) revalidatePath(`/clients/${existing.clientId}`);
    if (data.clientId && data.clientId !== existing.clientId) revalidatePath(`/clients/${data.clientId}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    const existing = await ownedEvent(ctx.workspace.id, eventId);
    await db.delete(calendarEvents).where(eq(calendarEvents.id, eventId));
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    if (existing.clientId) revalidatePath(`/clients/${existing.clientId}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function setCalendarEventStatus(eventId: string, status: "scheduled" | "in_progress" | "completed" | "cancelled"): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    await ownedEvent(ctx.workspace.id, eventId);
    await db.update(calendarEvents).set({ status }).where(eq(calendarEvents.id, eventId));
    revalidatePath("/calendar");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
