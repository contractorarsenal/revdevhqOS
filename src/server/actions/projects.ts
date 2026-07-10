"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { assertWorkspaceClient, assertWorkspaceMember } from "@/server/workspace-guards";
import { projectSchema } from "@/lib/validation";
import { logActivity } from "@/server/activity";

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
        color: data.color ?? null,
      })
      .returning();

    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "project.created", entityType: "project", entityId: row.id,
      metadata: { name: data.name },
    });
    revalidatePath("/projects");
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateProject(projectId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    await ownedProject(ctx.workspace.id, projectId);
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
        color: data.color ?? null,
      })
      .where(eq(projects.id, projectId));

    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function archiveProject(projectId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    await ownedProject(ctx.workspace.id, projectId);
    await db
      .update(projects)
      .set({ status: "archived", archivedAt: new Date() })
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspace.id)));
    revalidatePath("/projects");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
