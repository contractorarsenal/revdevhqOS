"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { logActivity } from "@/server/activity";
import { taskSchema } from "@/lib/validation";

async function ownedTask(workspaceId: string, taskId: string) {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Task not found in this workspace.");
  return row;
}

function revalidateTaskPaths(clientId?: string | null) {
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

function taskValues(data: ReturnType<typeof taskSchema.parse>) {
  return {
    title: data.title,
    description: data.description ?? null,
    status: data.status,
    priority: data.priority,
    assigneeId: data.assigneeId ?? null,
    clientId: data.clientId ?? null,
    leadId: data.leadId ?? null,
    opportunityId: data.opportunityId ?? null,
    dueDate: data.dueDate ? new Date(data.dueDate + "T12:00:00") : null,
  };
}

export async function createTask(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    const data = taskSchema.parse(input);
    await db.insert(tasks).values({
      workspaceId: ctx.workspace.id,
      ...taskValues(data),
      assigneeId: data.assigneeId ?? ctx.user.id,
    });
    revalidateTaskPaths(data.clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateTask(taskId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    const existing = await ownedTask(ctx.workspace.id, taskId);
    const data = taskSchema.parse(input);
    await db
      .update(tasks)
      .set({
        ...taskValues(data),
        completedAt:
          data.status === "completed"
            ? existing.completedAt ?? new Date()
            : null,
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, ctx.workspace.id)));
    revalidateTaskPaths(data.clientId ?? existing.clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function setTaskCompletion(taskId: string, completed: boolean): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    const existing = await ownedTask(ctx.workspace.id, taskId);
    await db
      .update(tasks)
      .set({
        status: completed ? "completed" : "todo",
        completedAt: completed ? new Date() : null,
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, ctx.workspace.id)));
    if (completed) {
      await logActivity({
        workspaceId: ctx.workspace.id, actorId: ctx.user.id,
        action: "task.completed", entityType: "task", entityId: taskId,
        clientId: existing.clientId, leadId: existing.leadId, opportunityId: existing.opportunityId,
        metadata: { title: existing.title },
      });
    }
    revalidateTaskPaths(existing.clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    const existing = await ownedTask(ctx.workspace.id, taskId);
    await db.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, ctx.workspace.id)));
    revalidateTaskPaths(existing.clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
