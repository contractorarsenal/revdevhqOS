"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, contacts, clientOnboarding, onboardingTemplates, onboardingSteps } from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { logActivity } from "@/server/activity";
import { clientSchema, contactSchema } from "@/lib/validation";
import { assertWorkspaceMember } from "@/server/workspace-guards";
import { revalidateGoalPaths } from "./revalidate-goals";

async function ownedClient(workspaceId: string, clientId: string) {
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Client not found in this workspace.");
  return row;
}

export async function createClient(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorize("member");
    const data = clientSchema.parse(input);
    await assertWorkspaceMember(ctx.workspace.id, data.ownerId);

    const clientId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(clients)
        .values({
          workspaceId: ctx.workspace.id,
          name: data.name,
          website: data.website ?? null,
          email: data.email ?? null,
          phone: data.phone ?? null,
          industry: data.industry ?? null,
          address: data.address ?? null,
          status: data.status,
          ownerId: data.ownerId ?? ctx.user.id,
          startDate: data.startDate ?? null,
        })
        .returning();
      if (data.contactName) {
        await tx.insert(contacts).values({
          workspaceId: ctx.workspace.id,
          clientId: row.id,
          name: data.contactName,
          email: data.contactEmail ?? null,
          phone: data.contactPhone ?? null,
          isPrimary: true,
        });
      }
      return row.id;
    });

    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "client.created", entityType: "client", entityId: clientId, clientId,
      metadata: { name: data.name },
    });
    revalidatePath("/clients");
    revalidateGoalPaths(); // new_clients goal metric counts creation time
    return { ok: true, data: { id: clientId } };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateClient(clientId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    await ownedClient(ctx.workspace.id, clientId);
    const data = clientSchema.parse(input);
    await assertWorkspaceMember(ctx.workspace.id, data.ownerId);
    await db
      .update(clients)
      .set({
        name: data.name,
        website: data.website ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        industry: data.industry ?? null,
        address: data.address ?? null,
        status: data.status,
        ownerId: data.ownerId ?? null,
        startDate: data.startDate ?? null,
      })
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, ctx.workspace.id)));
    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "client.updated", entityType: "client", entityId: clientId, clientId,
    });
    revalidatePath("/clients");
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function archiveClient(clientId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    await ownedClient(ctx.workspace.id, clientId);
    await db
      .update(clients)
      .set({ status: "archived", archivedAt: new Date() })
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, ctx.workspace.id)));
    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "client.archived", entityType: "client", entityId: clientId, clientId,
    });
    revalidatePath("/clients");
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function addContact(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    const data = contactSchema.parse(input);
    await ownedClient(ctx.workspace.id, data.clientId);
    await db.insert(contacts).values({
      workspaceId: ctx.workspace.id,
      clientId: data.clientId,
      name: data.name,
      title: data.title ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      isPrimary: data.isPrimary,
    });
    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "contact.added", entityType: "contact", clientId: data.clientId,
      metadata: { name: data.name },
    });
    revalidatePath(`/clients/${data.clientId}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/** Applies the default onboarding template's steps to a client. */
export async function startOnboarding(clientId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    await ownedClient(ctx.workspace.id, clientId);
    const [template] = await db
      .select()
      .from(onboardingTemplates)
      .where(and(eq(onboardingTemplates.workspaceId, ctx.workspace.id), eq(onboardingTemplates.isDefault, true)))
      .limit(1);
    if (!template) throw new Error("No default onboarding template exists.");
    const steps = await db
      .select()
      .from(onboardingSteps)
      .where(eq(onboardingSteps.templateId, template.id))
      .orderBy(onboardingSteps.position);
    const existing = await db
      .select({ id: clientOnboarding.id })
      .from(clientOnboarding)
      .where(and(eq(clientOnboarding.clientId, clientId), eq(clientOnboarding.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (existing.length > 0) throw new Error("Onboarding already started for this client.");
    await db.insert(clientOnboarding).values(
      steps.map((s) => ({
        workspaceId: ctx.workspace.id,
        clientId,
        templateId: template.id,
        stepName: s.name,
        position: s.position,
      }))
    );
    revalidatePath("/onboarding");
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function toggleOnboardingStep(stepId: string, completed: boolean): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    await db
      .update(clientOnboarding)
      .set({ completedAt: completed ? new Date() : null })
      .where(and(eq(clientOnboarding.id, stepId), eq(clientOnboarding.workspaceId, ctx.workspace.id)));
    revalidatePath("/onboarding");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/** Reverses a removal — puts the client back in the active list. */
export async function restoreClient(clientId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    await ownedClient(ctx.workspace.id, clientId);
    await db
      .update(clients)
      .set({ status: "active", archivedAt: null })
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, ctx.workspace.id)));
    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "client.updated", entityType: "client", entityId: clientId, clientId,
      metadata: { restored: true },
    });
    revalidatePath("/clients");
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
