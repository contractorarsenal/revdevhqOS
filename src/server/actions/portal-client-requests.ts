"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { clientRequests } from "@/lib/db/schema";
import { authorizePortal, actionError, type ActionResult } from "@/server/portal-authorize";
import { logActivity } from "@/server/activity";
import { portalClientRequestSchema } from "@/lib/validation";

/** A client submitting their own request through the portal. clientId and
 * workspaceId are re-derived from the server-verified portal session —
 * never taken from the browser (see authorizePortal). */
export async function submitClientRequest(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorizePortal("client_member");
    const { clientId, workspaceId } = ctx.membership;
    const data = portalClientRequestSchema.parse(input);

    const [row] = await db
      .insert(clientRequests)
      .values({
        workspaceId,
        clientId,
        type: data.type,
        description: data.description,
        priority: data.priority,
        submittedBy: ctx.user.id,
      })
      .returning({ id: clientRequests.id });

    await logActivity({
      workspaceId, actorId: ctx.user.id,
      action: "client_request.created", entityType: "client_request", entityId: row.id,
      clientId, metadata: { type: data.type, source: "portal" },
    });

    revalidatePath("/portal/requests");
    revalidatePath("/client-requests");
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
