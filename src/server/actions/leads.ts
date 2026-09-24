"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { leads, opportunities, pipelineStages } from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { logActivity } from "@/server/activity";
import { leadSchema, clientLeadManualEntrySchema } from "@/lib/validation";
import { assertWorkspaceMember, assertWorkspaceClient } from "@/server/workspace-guards";
import { revalidateGoalPaths } from "./revalidate-goals";
import { createClientLead } from "@/server/services/lead-ingestion";

async function ownedLead(workspaceId: string, leadId: string) {
  const [row] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Lead not found in this workspace.");
  return row;
}

function leadValues(data: ReturnType<typeof leadSchema.parse>) {
  return {
    company: data.company,
    contactName: data.contactName ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    source: data.source ?? null,
    status: data.status,
    serviceInterest: data.serviceInterest ?? null,
    estimatedValue: data.estimatedValue != null ? String(data.estimatedValue) : null,
    estimatedMrr: data.estimatedMrr != null ? String(data.estimatedMrr) : null,
    ownerId: data.ownerId ?? null,
    nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null,
    notes: data.notes ?? null,
  };
}

export async function createLead(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorize("member");
    const data = leadSchema.parse(input);
    await assertWorkspaceMember(ctx.workspace.id, data.ownerId);
    const [row] = await db
      .insert(leads)
      .values({ workspaceId: ctx.workspace.id, ...leadValues(data), ownerId: data.ownerId ?? ctx.user.id })
      .returning();
    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "lead.created", entityType: "lead", entityId: row.id, leadId: row.id,
      metadata: { company: data.company },
    });
    revalidatePath("/leads");
    revalidateGoalPaths(); // new_leads goal metric counts creation time
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateLead(leadId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    const existing = await ownedLead(ctx.workspace.id, leadId);
    const data = leadSchema.parse(input);
    await assertWorkspaceMember(ctx.workspace.id, data.ownerId);
    await db
      .update(leads)
      .set(leadValues(data))
      .where(and(eq(leads.id, leadId), eq(leads.workspaceId, ctx.workspace.id)));
    if (existing.status !== data.status) {
      await logActivity({
        workspaceId: ctx.workspace.id, actorId: ctx.user.id,
        action: "lead.status_changed", entityType: "lead", entityId: leadId, leadId,
        metadata: { from: existing.status, to: data.status },
      });
    }
    revalidatePath("/leads");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function touchLeadContact(leadId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    await ownedLead(ctx.workspace.id, leadId);
    await db
      .update(leads)
      .set({ lastContactedAt: new Date(), status: "contacted" })
      .where(and(eq(leads.id, leadId), eq(leads.workspaceId, ctx.workspace.id), eq(leads.status, "new")));
    await db
      .update(leads)
      .set({ lastContactedAt: new Date() })
      .where(and(eq(leads.id, leadId), eq(leads.workspaceId, ctx.workspace.id)));
    revalidatePath("/leads");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function markLeadLost(leadId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    await ownedLead(ctx.workspace.id, leadId);
    await db
      .update(leads)
      .set({ status: "lost", lostAt: new Date() })
      .where(and(eq(leads.id, leadId), eq(leads.workspaceId, ctx.workspace.id)));
    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "lead.lost", entityType: "lead", entityId: leadId, leadId,
    });
    revalidatePath("/leads");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/**
 * Internal owner/admin manually creating a lead FOR a client — appears in
 * that client's portal immediately. Routes through createClientLead().
 * Keys are optional here because the human form does not collect them, and
 * this action does not apply CA-client scope (staff may log any workspace
 * client). Automated Inbox ingest must POST /api/ingest/client-lead
 * (bearer secret). That path requires the keys on the initial insert and
 * rejects Trader U / unmapped clients.
 */
export async function createManualClientLead(input: unknown): Promise<ActionResult<{ id: string; duplicate: boolean }>> {
  try {
    const ctx = await authorize("admin");
    const data = clientLeadManualEntrySchema.parse(input);
    await assertWorkspaceClient(ctx.workspace.id, data.clientId);

    const { id, duplicate } = await createClientLead({
      workspaceId: ctx.workspace.id,
      clientId: data.clientId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      requestedService: data.requestedService,
      source: data.source,
      // Date-only. Do not parse with new Date("YYYY-MM-DD") — that is UTC
      // midnight and displays as the previous day in America/Los_Angeles.
      receivedOn: data.receivedOn,
      externalMessageId: data.externalMessageId,
      dedupeKey: data.dedupeKey,
      ingestionSource: data.ingestionSource ?? "manual",
      status: data.status,
      estimatedValue: data.estimatedValue,
      createdVia: "manual",
      actorId: ctx.user.id,
    });

    revalidatePath(`/clients/${data.clientId}`);
    revalidatePath(`/clients/${data.clientId}/leads`);
    revalidatePath("/portal");
    revalidatePath("/portal/leads");
    // Deliberately no revalidateGoalPaths() here — new_leads is a sales
    // (leads table) goal metric; client leads are a separate table/metric
    // universe entirely (see the sales/client leads split).
    return { ok: true, data: { id, duplicate } };
  } catch (err) {
    return actionError(err);
  }
}

/** Creates an open opportunity in the first pipeline stage from a lead. */
export async function convertLeadToOpportunity(leadId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorize("member");
    const lead = await ownedLead(ctx.workspace.id, leadId);

    const [firstStage] = await db
      .select()
      .from(pipelineStages)
      .where(and(eq(pipelineStages.workspaceId, ctx.workspace.id), eq(pipelineStages.isWon, false), eq(pipelineStages.isLost, false)))
      .orderBy(pipelineStages.position)
      .limit(1);
    if (!firstStage) throw new Error("Create at least one pipeline stage first.");

    const oppId = await db.transaction(async (tx) => {
      // Claim the lead atomically first — this is the actual mutex. Two
      // concurrent conversions both pass the pre-check above, but only one
      // of these conditional UPDATEs can return a row; the loser sees 0
      // rows and bails before ever inserting a duplicate opportunity.
      const claimed = await tx
        .update(leads)
        .set({ status: "converted" })
        .where(and(eq(leads.id, lead.id), eq(leads.workspaceId, ctx.workspace.id), ne(leads.status, "converted")))
        .returning({ id: leads.id });
      if (claimed.length === 0) throw new Error("This lead was already converted.");

      const [opp] = await tx
        .insert(opportunities)
        .values({
          workspaceId: ctx.workspace.id,
          stageId: firstStage.id,
          name: lead.company,
          leadId: lead.id,
          contactName: lead.contactName,
          value: lead.estimatedValue ?? "0",
          mrr: lead.estimatedMrr ?? "0",
          ownerId: lead.ownerId ?? ctx.user.id,
        })
        .returning();
      return opp.id;
    });

    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "lead.converted_to_opportunity", entityType: "lead",
      entityId: leadId, leadId, opportunityId: oppId,
    });
    revalidatePath("/leads");
    revalidatePath("/pipeline");
    return { ok: true, data: { id: oppId } };
  } catch (err) {
    return actionError(err);
  }
}
