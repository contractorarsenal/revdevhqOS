"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { authorizePortal, actionError, type ActionResult } from "@/server/portal-authorize";
import { logActivity } from "@/server/activity";
import { assertClientEligibleAssignee } from "@/server/workspace-guards";
import { clientLeadStatusTimestamp } from "@/lib/leads-client";
import {
  clientLeadStatusSchema, clientLeadAssignSchema, clientLeadEstimateSchema,
  clientLeadClosedValueSchema, clientLeadNoteSchema,
} from "@/lib/validation";

function revalidateClientLeads(clientId: string) {
  revalidatePath("/portal");
  revalidatePath("/portal/leads");
  revalidatePath("/leads");
  revalidatePath(`/clients/${clientId}`);
}

/** Every mutation's ownership check — a leadId belonging to another client
 * simply matches no row, so the mutation never touches it. */
async function assertClientOwnedLeadRow(workspaceId: string, clientId: string, leadId: string) {
  const [row] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId), eq(leads.clientId, clientId)))
    .limit(1);
  if (!row) throw new Error("Lead not found.");
  return row;
}

/** Every mutation here re-derives workspaceId/clientId from the SERVER
 * SESSION (authorizePortal → requireClientPortalUser), never from the
 * leadId's caller-supplied context. */

export async function updateClientLeadStatus(leadId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorizePortal("client_member");
    const { clientId, workspaceId } = ctx.membership;
    await assertClientOwnedLeadRow(workspaceId, clientId, leadId);
    const { status } = clientLeadStatusSchema.parse(input);

    const stamp = clientLeadStatusTimestamp(status, new Date());

    await db.update(leads).set({ status, ...stamp }).where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId), eq(leads.clientId, clientId)));

    await logActivity({
      workspaceId, actorId: ctx.user.id, action: "lead.status_changed",
      entityType: "lead", entityId: leadId, leadId, clientId,
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

    await db.update(leads).set({ ownerId: profileId ?? null }).where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId), eq(leads.clientId, clientId)));

    await logActivity({
      workspaceId, actorId: ctx.user.id, action: "lead.assigned_changed",
      entityType: "lead", entityId: leadId, leadId, clientId,
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
      .update(leads)
      .set({ estimatedValue: estimatedValue != null ? String(estimatedValue) : null })
      .where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId), eq(leads.clientId, clientId)));

    await logActivity({
      workspaceId, actorId: ctx.user.id, action: "lead.estimated_value_updated",
      entityType: "lead", entityId: leadId, leadId, clientId,
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
      .update(leads)
      .set({ closedValue: closedValue != null ? String(closedValue) : null })
      .where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId), eq(leads.clientId, clientId)));

    await logActivity({
      workspaceId, actorId: ctx.user.id, action: "lead.closed_value_updated",
      entityType: "lead", entityId: leadId, leadId, clientId,
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

    await db.update(leads).set({ notes: nextNotes }).where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId), eq(leads.clientId, clientId)));

    await logActivity({
      // Never log the note's own content — just that one was added.
      workspaceId, actorId: ctx.user.id, action: "lead.note_added",
      entityType: "lead", entityId: leadId, leadId, clientId,
    });
    revalidateClientLeads(clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
