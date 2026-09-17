"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { assertWorkspaceClient, assertWorkspaceMember } from "@/server/workspace-guards";
import { projectSchema } from "@/lib/validation";
import { logActivity } from "@/server/activity";
import { revalidateGoalPaths } from "./revalidate-goals";

async function ownedProject(workspaceId: string, projectId: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Project not found in this workspace.");
  return row;
}

export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorize("member");
    const data = projectSchema.parse(input);
    await assertWorkspaceClient(ctx.workspace.id, data.clientId);
    await assertWorkspaceMember(ctx.workspace.id, data.ownerId);

    const [row] = await db
      .insert(projects)
      .values({
        workspaceId: ctx.workspace.id,
        name: data.name,
        description: data.description ?? null,
        status: data.status,
        ownerId: data.ownerId ?? ctx.user.id,
        clientId: data.clientId ?? null,
        startDate: data.startDate ?? null,
        dueDate: data.dueDate ?? null,
        waitingOn: data.waitingOn ?? null,
        nextAction: data.nextAction ?? null,
        color: data.color ?? null,
        completedAt: data.status === "live" ? new Date() : null,
      })
      .returning();

    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "project.created", entityType: "project", entityId: row.id,
      metadata: { name: data.name },
    });
    revalidatePath("/projects");
    if (data.status === "live") revalidateGoalPaths(); // projects_completed goal metric
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateProject(projectId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    const existing = await ownedProject(ctx.workspace.id, projectId);
    const data = projectSchema.parse(input);
    await assertWorkspaceClient(ctx.workspace.id, data.clientId);
    await assertWorkspaceMember(ctx.workspace.id, data.ownerId);

    await db
      .update(projects)
      .set({
        name: data.name,
        description: data.description ?? null,
        status: data.status,
        ownerId: data.ownerId ?? null,
        clientId: data.clientId ?? null,
        startDate: data.startDate ?? null,
        dueDate: data.dueDate ?? null,
        waitingOn: data.waitingOn ?? null,
        nextAction: data.nextAction ?? null,
        color: data.color ?? null,
        // Completion timestamp powers "projects completed" goal metrics:
        // stamped on the transition into "live" (delivered/launched), kept
        // if already set, cleared when the project moves off "live".
        completedAt:
          data.status === "live"
            ? existing.completedAt ?? new Date()
            : null,
      })
      .where(eq(projects.id, projectId));

    if (existing.status !== data.status) {
      await logActivity({
        workspaceId: ctx.workspace.id, actorId: ctx.user.id,
        action: "project.stage_changed", entityType: "project", entityId: projectId,
        metadata: { from: existing.status, to: data.status },
      });
    }
    if (existing.waitingOn !== (data.waitingOn ?? null)) {
      await logActivity({
        workspaceId: ctx.workspace.id, actorId: ctx.user.id,
        action: "project.waiting_on_changed", entityType: "project", entityId: projectId,
        metadata: { from: existing.waitingOn, to: data.waitingOn ?? null },
      });
    }
    if (existing.nextAction !== (data.nextAction ?? null)) {
      await logActivity({
        workspaceId: ctx.workspace.id, actorId: ctx.user.id,
        action: "project.next_action_changed", entityType: "project", entityId: projectId,
        metadata: { from: existing.nextAction, to: data.nextAction ?? null },
      });
    }

    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    // projects_completed goal metric: revalidate on any transition into or
    // out of "live" (reopening a project un-counts it too).
    if (data.status === "live" || existing.completedAt) revalidateGoalPaths();
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function archiveProject(projectId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    const existing = await ownedProject(ctx.workspace.id, projectId);
    await db
      .update(projects)
      .set({ status: "closed", archivedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspace.id)));
    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "project.archived", entityType: "project", entityId: projectId,
      metadata: { from: existing.status },
    });
    revalidatePath("/projects");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
