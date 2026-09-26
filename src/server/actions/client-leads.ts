"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { clientLeads } from "@/lib/db/schema";
import { authorizePortal, actionError, type ActionResult } from "@/server/portal-authorize";
import { logActivity } from "@/server/activity";
import { assertClientEligibleAssignee } from "@/server/workspace-guards";
import { clientLeadStatusTimestamp } from "@/lib/leads-client";
import {
  clientLeadStatusSchema, clientLeadAssignSchema, clientLeadEstimateSchema,
  clientLeadClosedValueSchema, clientLeadNoteSchema,
} from "@/lib/validation";

function revalidateClientLeads(clientId: string) {
  revalidatePath("/clientportal/dashboard");
  revalidatePath("/clientportal/leads");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/leads`);
}

/** Every mutation's ownership check — a leadId belonging to another client
 * simply matches no row, so the mutation never touches it. */
async function assertClientOwnedLeadRow(workspaceId: string, clientId: string, leadId: string) {
  const [row] = await db
    .select()
    .from(clientLeads)
    .where(and(eq(clientLeads.id, leadId), eq(clientLeads.workspaceId, workspaceId), eq(clientLeads.clientId, clientId)))
    .limit(1);
  if (!row) throw new Error("Lead not found.");
  return row;
}

/** Every mutation here re-derives workspaceId/clientId from the SERVER
 * SESSION (authorizePortal → requireClientPortalUser), never from the
 * leadId's caller-supplied context. None of these ever touch clientId —
 * a client lead's client association cannot be changed by any action. */

export async function updateClientLeadStatus(leadId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorizePortal("client_member");
    const { clientId, workspaceId } = ctx.membership;
    await assertClientOwnedLeadRow(workspaceId, clientId, leadId);
    const { status } = clientLeadStatusSchema.parse(input);

    const stamp = clientLeadStatusTimestamp(status, new Date());

    await db.update(clientLeads).set({ status, ...stamp }).where(and(eq(clientLeads.id, leadId), eq(clientLeads.workspaceId, workspaceId), eq(clientLeads.clientId, clientId)));

    await logActivity({
      workspaceId, actorId: ctx.user.id, action: "client_lead.status_changed",
      entityType: "client_lead", entityId: leadId, clientId,
      metadata: { status },
    });
    revalidateClientLeads(clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function assignClientLead(leadId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorizePortal("client_member");
    const { clientId, workspaceId } = ctx.membership;
    await assertClientOwnedLeadRow(workspaceId, clientId, leadId);
    const { profileId } = clientLeadAssignSchema.parse(input);
    await assertClientEligibleAssignee(workspaceId, clientId, profileId);

    await db.update(clientLeads).set({ ownerId: profileId ?? null }).where(and(eq(clientLeads.id, leadId), eq(clientLeads.workspaceId, workspaceId), eq(clientLeads.clientId, clientId)));

    await logActivity({
      workspaceId, actorId: ctx.user.id, action: "client_lead.assigned_changed",
      entityType: "client_lead", entityId: leadId, clientId,
      metadata: { assigned: Boolean(profileId) },
    });
    revalidateClientLeads(clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateClientLeadEstimate(leadId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorizePortal("client_member");
    const { clientId, workspaceId } = ctx.membership;
    await assertClientOwnedLeadRow(workspaceId, clientId, leadId);
    const { estimatedValue } = clientLeadEstimateSchema.parse(input);

    await db
      .update(clientLeads)
      .set({ estimatedValue: estimatedValue != null ? String(estimatedValue) : null })
      .where(and(eq(clientLeads.id, leadId), eq(clientLeads.workspaceId, workspaceId), eq(clientLeads.clientId, clientId)));

    await logActivity({
      workspaceId, actorId: ctx.user.id, action: "client_lead.estimated_value_updated",
      entityType: "client_lead", entityId: leadId, clientId,
    });
    revalidateClientLeads(clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/**
 * Confirmed Revenue only ever counts a closed value on a WON lead — this is
 * enforced here, not just in the UI, so the number can never be inflated by
 * an API-level call setting a closed value on an open lead.
 */
export async function updateClientLeadClosedValue(leadId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorizePortal("client_member");
    const { clientId, workspaceId } = ctx.membership;
    const existing = await assertClientOwnedLeadRow(workspaceId, clientId, leadId);
    const { closedValue } = clientLeadClosedValueSchema.parse(input);
    if (closedValue != null && existing.status !== "won") {
      throw new Error("Mark this lead won before entering a closed value.");
    }

    await db
      .update(clientLeads)
      .set({ closedValue: closedValue != null ? String(closedValue) : null })
      .where(and(eq(clientLeads.id, leadId), eq(clientLeads.workspaceId, workspaceId), eq(clientLeads.clientId, clientId)));

    await logActivity({
      workspaceId, actorId: ctx.user.id, action: "client_lead.closed_value_updated",
      entityType: "client_lead", entityId: leadId, clientId,
    });
    revalidateClientLeads(clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function addClientLeadNote(leadId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorizePortal("client_member");
    const { clientId, workspaceId } = ctx.membership;
    const existing = await assertClientOwnedLeadRow(workspaceId, clientId, leadId);
    const { note } = clientLeadNoteSchema.parse(input);

    const entry = `[${format(new Date(), "MMM d, yyyy h:mm a")}] ${ctx.user.name}: ${note}`;
    const nextNotes = existing.notes ? `${existing.notes}\n\n${entry}` : entry;

    await db.update(clientLeads).set({ notes: nextNotes }).where(and(eq(clientLeads.id, leadId), eq(clientLeads.workspaceId, workspaceId), eq(clientLeads.clientId, clientId)));

    await logActivity({
      // Never log the note's own content — just that one was added.
      workspaceId, actorId: ctx.user.id, action: "client_lead.note_added",
      entityType: "client_lead", entityId: leadId, clientId,
    });
    revalidateClientLeads(clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
