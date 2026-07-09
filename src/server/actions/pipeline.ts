"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  pipelineStages, opportunities, leads, clients, contacts, subscriptions, services, tasks,
} from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { logActivity } from "@/server/activity";
import { stageSchema, opportunitySchema, convertOpportunitySchema } from "@/lib/validation";

async function ownedStage(workspaceId: string, stageId: string) {
  const [row] = await db
    .select()
    .from(pipelineStages)
    .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Stage not found in this workspace.");
  return row;
}

async function ownedOpportunity(workspaceId: string, oppId: string) {
  const [row] = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.id, oppId), eq(opportunities.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Opportunity not found in this workspace.");
  return row;
}

/* ===== stages ===== */
export async function createStage(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("admin");
    const data = stageSchema.parse(input);
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${pipelineStages.position}), -1)` })
      .from(pipelineStages)
      .where(eq(pipelineStages.workspaceId, ctx.workspace.id));
    await db.insert(pipelineStages).values({
      workspaceId: ctx.workspace.id,
      name: data.name,
      probability: data.probability,
      position: Number(max) + 1,
    });
    revalidatePath("/pipeline");
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateStage(stageId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("admin");
    await ownedStage(ctx.workspace.id, stageId);
    const data = stageSchema.parse(input);
    await db
      .update(pipelineStages)
      .set({ name: data.name, probability: data.probability })
      .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.workspaceId, ctx.workspace.id)));
    revalidatePath("/pipeline");
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function moveStage(stageId: string, direction: "up" | "down"): Promise<ActionResult> {
  try {
    const ctx = await authorize("admin");
    const stage = await ownedStage(ctx.workspace.id, stageId);
    const all = await db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.workspaceId, ctx.workspace.id))
      .orderBy(pipelineStages.position);
    const idx = all.findIndex((s) => s.id === stage.id);
    const swapWith = direction === "up" ? all[idx - 1] : all[idx + 1];
    if (!swapWith) return { ok: true };
    await db.transaction(async (tx) => {
      await tx.update(pipelineStages).set({ position: swapWith.position }).where(eq(pipelineStages.id, stage.id));
      await tx.update(pipelineStages).set({ position: stage.position }).where(eq(pipelineStages.id, swapWith.id));
    });
    revalidatePath("/pipeline");
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/* ===== opportunities ===== */
function oppValues(data: ReturnType<typeof opportunitySchema.parse>) {
  return {
    name: data.name,
    stageId: data.stageId,
    leadId: data.leadId ?? null,
    clientId: data.clientId ?? null,
    contactName: data.contactName ?? null,
    value: String(data.value),
    mrr: String(data.mrr),
    ownerId: data.ownerId ?? null,
    expectedCloseDate: data.expectedCloseDate ?? null,
  };
}

export async function createOpportunity(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    const data = opportunitySchema.parse(input);
    await ownedStage(ctx.workspace.id, data.stageId);
    const [row] = await db
      .insert(opportunities)
      .values({ workspaceId: ctx.workspace.id, ...oppValues(data), ownerId: data.ownerId ?? ctx.user.id })
      .returning();
    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "opportunity.created", entityType: "opportunity", entityId: row.id, opportunityId: row.id,
      metadata: { name: data.name },
    });
    revalidatePath("/pipeline");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateOpportunity(oppId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    await ownedOpportunity(ctx.workspace.id, oppId);
    const data = opportunitySchema.parse(input);
    await ownedStage(ctx.workspace.id, data.stageId);
    await db
      .update(opportunities)
      .set(oppValues(data))
      .where(and(eq(opportunities.id, oppId), eq(opportunities.workspaceId, ctx.workspace.id)));
    revalidatePath("/pipeline");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/** Persists a drag-and-drop stage change. */
export async function moveOpportunity(oppId: string, stageId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    const opp = await ownedOpportunity(ctx.workspace.id, oppId);
    const stage = await ownedStage(ctx.workspace.id, stageId);
    if (opp.stageId === stageId) return { ok: true };
    await db
      .update(opportunities)
      .set({
        stageId,
        status: stage.isWon ? "won" : stage.isLost ? "lost" : "open",
        wonAt: stage.isWon ? new Date() : null,
        lostAt: stage.isLost ? new Date() : null,
      })
      .where(and(eq(opportunities.id, oppId), eq(opportunities.workspaceId, ctx.workspace.id)));
    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "opportunity.moved", entityType: "opportunity", entityId: oppId, opportunityId: oppId,
      metadata: { to: stage.name },
    });
    revalidatePath("/pipeline");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function markOpportunityOutcome(oppId: string, outcome: "won" | "lost", reason?: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    await ownedOpportunity(ctx.workspace.id, oppId);
    const [stage] = await db
      .select()
      .from(pipelineStages)
      .where(and(
        eq(pipelineStages.workspaceId, ctx.workspace.id),
        outcome === "won" ? eq(pipelineStages.isWon, true) : eq(pipelineStages.isLost, true)
      ))
      .limit(1);
    await db
      .update(opportunities)
      .set({
        status: outcome,
        stageId: stage ? stage.id : undefined,
        wonAt: outcome === "won" ? new Date() : null,
        lostAt: outcome === "lost" ? new Date() : null,
        lostReason: outcome === "lost" ? reason ?? null : null,
      })
      .where(and(eq(opportunities.id, oppId), eq(opportunities.workspaceId, ctx.workspace.id)));
    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: `opportunity.${outcome}`, entityType: "opportunity", entityId: oppId, opportunityId: oppId,
    });
    revalidatePath("/pipeline");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/**
 * Closed-won conversion: creates the client, copies contact info, creates
 * selected subscriptions, starts onboarding tasks, marks the opportunity won
 * and the source lead converted — in one transaction.
 */
export async function convertOpportunityToClient(input: unknown): Promise<ActionResult<{ clientId: string }>> {
  try {
    const ctx = await authorize("member");
    const data = convertOpportunitySchema.parse(input);
    const opp = await ownedOpportunity(ctx.workspace.id, data.opportunityId);
    if (opp.clientId) throw new Error("This opportunity is already linked to a client.");

    for (const sub of data.subscriptions) {
      const [svc] = await db
        .select({ id: services.id })
        .from(services)
        .where(and(eq(services.id, sub.serviceId), eq(services.workspaceId, ctx.workspace.id)))
        .limit(1);
      if (!svc) throw new Error("Selected service not found in this workspace.");
    }

    const [wonStage] = await db
      .select()
      .from(pipelineStages)
      .where(and(eq(pipelineStages.workspaceId, ctx.workspace.id), eq(pipelineStages.isWon, true)))
      .limit(1);

    const clientId = await db.transaction(async (tx) => {
      const [client] = await tx
        .insert(clients)
        .values({
          workspaceId: ctx.workspace.id,
          name: data.clientName,
          status: "onboarding",
          ownerId: opp.ownerId ?? ctx.user.id,
          startDate: new Date().toISOString().slice(0, 10),
        })
        .returning();

      if (data.contactName) {
        await tx.insert(contacts).values({
          workspaceId: ctx.workspace.id,
          clientId: client.id,
          name: data.contactName,
          email: data.contactEmail ?? null,
          isPrimary: true,
        });
      }

      if (data.subscriptions.length > 0) {
        await tx.insert(subscriptions).values(
          data.subscriptions.map((s) => ({
            workspaceId: ctx.workspace.id,
            clientId: client.id,
            serviceId: s.serviceId,
            amount: String(s.amount),
            frequency: s.frequency,
            status: "active" as const,
            startDate: new Date().toISOString().slice(0, 10),
          }))
        );
      }

      await tx.insert(tasks).values({
        workspaceId: ctx.workspace.id,
        title: `Kick off onboarding — ${data.clientName}`,
        priority: "high",
        assigneeId: opp.ownerId ?? ctx.user.id,
        clientId: client.id,
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      });

      await tx
        .update(opportunities)
        .set({
          status: "won",
          wonAt: new Date(),
          clientId: client.id,
          stageId: wonStage ? wonStage.id : opp.stageId,
        })
        .where(eq(opportunities.id, opp.id));

      if (opp.leadId) {
        await tx
          .update(leads)
          .set({ status: "converted", convertedClientId: client.id })
          .where(eq(leads.id, opp.leadId));
      }
      return client.id;
    });

    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "opportunity.won", entityType: "opportunity",
      entityId: opp.id, opportunityId: opp.id, clientId,
      metadata: { convertedTo: data.clientName },
    });
    revalidatePath("/pipeline");
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return { ok: true, data: { clientId } };
  } catch (err) {
    return actionError(err);
  }
}
