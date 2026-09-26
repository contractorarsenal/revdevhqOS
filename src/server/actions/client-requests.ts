"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientRequests, tasks } from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { assertWorkspaceClient, assertWorkspaceMember } from "@/server/workspace-guards";
import { logActivity } from "@/server/activity";
import { clientRequestSchema, updateClientRequestStatusSchema, triageClientRequestSchema } from "@/lib/validation";

function revalidateClientRequests(clientId: string) {
  revalidatePath("/client-requests");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clientportal/requests");
}

/** Staff logging a request on the client's behalf (e.g. a phone call) —
 * mirrors createManualClientLead's staff-side entry point alongside the
 * portal's own submitClientRequest. */
export async function createClientRequest(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    const data = clientRequestSchema.parse(input);
    await assertWorkspaceClient(ctx.workspace.id, data.clientId);

    const [row] = await db
      .insert(clientRequests)
      .values({
        workspaceId: ctx.workspace.id,
        clientId: data.clientId,
        type: data.type,
        description: data.description,
        priority: data.priority,
        submittedBy: ctx.user.id,
      })
      .returning({ id: clientRequests.id });

    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "client_request.created", entityType: "client_request", entityId: row.id,
      clientId: data.clientId, metadata: { type: data.type },
    });
    revalidateClientRequests(data.clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

async function ownedRequest(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(clientRequests)
    .where(and(eq(clientRequests.id, id), eq(clientRequests.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Request not found in this workspace.");
  return row;
}

export async function updateClientRequestStatus(id: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    const existing = await ownedRequest(ctx.workspace.id, id);
    const data = updateClientRequestStatusSchema.parse(input);

    await db
      .update(clientRequests)
      .set({
        status: data.status,
        resolutionNotes: data.resolutionNotes ?? existing.resolutionNotes,
        clientUpdate: data.clientUpdate === undefined ? existing.clientUpdate : data.clientUpdate,
      })
      .where(eq(clientRequests.id, id));

    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "client_request.status_changed", entityType: "client_request", entityId: id,
      clientId: existing.clientId, metadata: { status: data.status, previousStatus: existing.status },
    });
    revalidateClientRequests(existing.clientId);
    revalidatePath("/clientportal/requests");
    revalidatePath("/clientportal/dashboard");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/** Creates the internal execution task for a request and links it —
 * "what the client asked for" (the request) stays a separate record from
 * "the work required to do it" (the task). Moves the request to
 * in_progress since there is now real work underway. */
export async function triageClientRequestToTask(id: string, input: unknown): Promise<ActionResult<{ taskId: string }>> {
  try {
    const ctx = await authorize("member");
    const existing = await ownedRequest(ctx.workspace.id, id);
    if (existing.taskId) throw new Error("This request already has a linked task.");
    const data = triageClientRequestSchema.parse(input);
    await assertWorkspaceMember(ctx.workspace.id, data.assigneeId);

    const [task] = await db
      .insert(tasks)
      .values({
        workspaceId: ctx.workspace.id,
        title: data.taskTitle,
        clientId: existing.clientId,
        priority: existing.priority,
        assigneeId: data.assigneeId ?? null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      })
      .returning({ id: tasks.id });

    await db
      .update(clientRequests)
      .set({ taskId: task.id, status: "in_progress" })
      .where(eq(clientRequests.id, id));

    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "client_request.triaged", entityType: "client_request", entityId: id,
      clientId: existing.clientId, metadata: { taskId: task.id },
    });
    revalidateClientRequests(existing.clientId);
    revalidatePath("/tasks");
    return { ok: true, data: { taskId: task.id } };
  } catch (err) {
    return actionError(err);
  }
}
