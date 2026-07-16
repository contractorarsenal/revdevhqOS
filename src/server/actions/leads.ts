"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
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
    clientId: data.clientId ?? null,
    nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null,
    notes: data.notes ?? null,
  };
}

export async function createLead(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorize("member");
    const data = leadSchema.parse(input);
    await assertWorkspaceMember(ctx.workspace.id, data.ownerId);
    await assertWorkspaceClient(ctx.workspace.id, data.clientId);
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
    await ownedLead(ctx.workspace.id, leadId);
    const data = leadSchema.parse(input);
    await assertWorkspaceMember(ctx.workspace.id, data.ownerId);
    await assertWorkspaceClient(ctx.workspace.id, data.clientId);
    await db
      .update(leads)
      .set(leadValues(data))
      .where(and(eq(leads.id, leadId), eq(leads.workspaceId, ctx.workspace.id)));
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
 * that client's portal immediately. Routes through createClientLead(), the
 * one canonical lead-creation path also intended for future website-form
 * and webhook/n8n ingestion.
 */
export async function createManualClientLead(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorize("admin");
    const data = clientLeadManualEntrySchema.parse(input);
    await assertWorkspaceClient(ctx.workspace.id, data.clientId);

    const { id } = await createClientLead({
      workspaceId: ctx.workspace.id,
      clientId: data.clientId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      requestedService: data.requestedService,
      source: data.source,
      receivedAt: new Date(data.receivedAt),
      status: data.status,
      estimatedValue: data.estimatedValue,
      createdVia: "manual",
      actorId: ctx.user.id,
    });

    revalidatePath("/leads");
    revalidatePath(`/clients/${data.clientId}`);
    revalidatePath("/portal");
    revalidatePath("/portal/leads");
    revalidateGoalPaths(); // new_leads goal metric counts creation time
    return { ok: true, data: { id } };
  } catch (err) {
    return actionError(err);
  }
}

/** Creates an open opportunity in the first pipeline stage from a lead. */
export async function convertLeadToOpportunity(leadId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorize("member");
    const lead = await ownedLead(ctx.workspace.id, leadId);
    if (lead.status === "converted") throw new Error("This lead was already converted.");

    const [firstStage] = await db
      .select()
      .from(pipelineStages)
      .where(and(eq(pipelineStages.workspaceId, ctx.workspace.id), eq(pipelineStages.isWon, false), eq(pipelineStages.isLost, false)))
      .orderBy(pipelineStages.position)
      .limit(1);
    if (!firstStage) throw new Error("Create at least one pipeline stage first.");

    const oppId = await db.transaction(async (tx) => {
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
      await tx.update(leads).set({ status: "qualified" }).where(eq(leads.id, lead.id));
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
