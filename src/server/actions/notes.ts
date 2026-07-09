"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { logActivity } from "@/server/activity";
import { noteSchema } from "@/lib/validation";
import { assertWorkspaceRelations } from "@/server/workspace-guards";

export async function addNote(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    const data = noteSchema.parse(input);
    await assertWorkspaceRelations(ctx.workspace.id, data);
    await db.insert(notes).values({
      workspaceId: ctx.workspace.id,
      body: data.body,
      authorId: ctx.user.id,
      clientId: data.clientId ?? null,
      leadId: data.leadId ?? null,
      opportunityId: data.opportunityId ?? null,
      taskId: data.taskId ?? null,
    });
    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "note.added", entityType: "note",
      clientId: data.clientId ?? null, leadId: data.leadId ?? null, opportunityId: data.opportunityId ?? null,
    });
    if (data.clientId) revalidatePath(`/clients/${data.clientId}`);
    revalidatePath("/leads");
    revalidatePath("/tasks");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
