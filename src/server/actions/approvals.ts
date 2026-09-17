"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { approvals } from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { assertWorkspaceRelations } from "@/server/workspace-guards";
import { logActivity } from "@/server/activity";
import { createApprovalSchema, resolveApprovalSchema } from "@/lib/validation";

function revalidateApprovals() {
  revalidatePath("/approvals");
  revalidatePath("/dashboard");
}

/** Any workspace member can raise something that needs an owner's call —
 * resolving it is the owner-level action, not raising it. */
export async function createApproval(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    const data = createApprovalSchema.parse(input);
    await assertWorkspaceRelations(ctx.workspace.id, {
      clientId: data.clientId, leadId: data.leadId, taskId: data.taskId, projectId: data.projectId,
    });

    const [row] = await db
      .insert(approvals)
      .values({
        workspaceId: ctx.workspace.id,
        title: data.title,
        description: data.description ?? null,
        type: data.type,
        riskSummary: data.riskSummary ?? null,
        requestedAction: data.requestedAction ?? null,
        clientId: data.clientId ?? null,
        projectId: data.projectId ?? null,
        leadId: data.leadId ?? null,
        taskId: data.taskId ?? null,
        requestedBy: ctx.user.id,
      })
      .returning({ id: approvals.id });

    await logActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      action: "approval.requested",
      entityType: "approval",
      entityId: row.id,
      clientId: data.clientId ?? null,
      leadId: data.leadId ?? null,
      metadata: { title: data.title, type: data.type },
    });

    revalidateApprovals();
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/** Approve / decline / resolve / cancel — owner-level, and only from
 * "pending" so an item can't be resolved twice or re-resolved differently. */
export async function resolveApproval(id: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("owner");
    const data = resolveApprovalSchema.parse(input);

    const [existing] = await db
      .select({ id: approvals.id, status: approvals.status, clientId: approvals.clientId, leadId: approvals.leadId })
      .from(approvals)
      .where(and(eq(approvals.id, id), eq(approvals.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (!existing) throw new Error("Approval not found.");
    if (existing.status !== "pending") throw new Error("This has already been resolved.");

    await db
      .update(approvals)
      .set({
        status: data.status,
        resolutionNotes: data.resolutionNotes ?? null,
        resolvedBy: ctx.user.id,
        resolvedAt: new Date(),
      })
      .where(eq(approvals.id, id));

    await logActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      action: "approval.resolved",
      entityType: "approval",
      entityId: id,
      clientId: existing.clientId,
      leadId: existing.leadId,
      metadata: { status: data.status },
    });

    revalidateApprovals();
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
