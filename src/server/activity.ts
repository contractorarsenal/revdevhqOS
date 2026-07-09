import "server-only";
import { db } from "@/lib/db";
import { activityLogs } from "@/lib/db/schema";

type ActivityInput = {
  workspaceId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  clientId?: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
  metadata?: Record<string, unknown>;
};

/** Fire-and-forget activity logging; never blocks or fails the main mutation. */
export async function logActivity(input: ActivityInput) {
  try {
    await db.insert(activityLogs).values({
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      clientId: input.clientId ?? null,
      leadId: input.leadId ?? null,
      opportunityId: input.opportunityId ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    console.error("activity log failed", err);
  }
}
