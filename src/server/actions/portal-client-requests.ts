"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { clientRequests, projects } from "@/lib/db/schema";
import { authorizePortal, actionError, type ActionResult } from "@/server/portal-authorize";
import { logActivity } from "@/server/activity";
import { portalRequestWithProjectSchema } from "@/lib/validation";

/** A client submitting their own request through the portal. clientId and
 * workspaceId are re-derived from the server-verified portal session —
 * never taken from the browser (see authorizePortal). */
export async function submitClientRequest(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorizePortal("client_member");
    const { clientId, workspaceId } = ctx.membership;
    const data = portalRequestWithProjectSchema.parse(input);

    // A linked project must be one of THIS client's client-visible projects —
    // any other id (another client's, hidden, or nonexistent) is rejected.
    if (data.projectId) {
      const [proj] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(
          eq(projects.id, data.projectId), eq(projects.workspaceId, workspaceId),
          eq(projects.clientId, clientId), eq(projects.clientVisible, true)
        ))
        .limit(1);
      if (!proj) throw new Error("Project not found.");
    }

    const [row] = await db
      .insert(clientRequests)
      .values({
        workspaceId,
        clientId,
        type: data.type,
        description: data.description,
        priority: data.priority,
        projectId: data.projectId ?? null,
        submittedBy: ctx.user.id,
      })
      .returning({ id: clientRequests.id });

    await logActivity({
      workspaceId, actorId: ctx.user.id,
      action: "client_request.created", entityType: "client_request", entityId: row.id,
      clientId, metadata: { type: data.type, source: "portal" },
    });

    revalidatePath("/clientportal/requests");
    revalidatePath("/clientportal/dashboard");
    revalidatePath("/client-requests");
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
