"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { services, subscriptions, invoices, invoiceItems, payments, clients } from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { logActivity } from "@/server/activity";
import { serviceSchema, subscriptionSchema, invoiceSchema, paymentSchema } from "@/lib/validation";
import { roundCents, toAmount } from "@/lib/finance/metrics";

function revalidateBilling(clientId?: string | null) {
  revalidatePath("/billing");
  revalidatePath("/dashboard");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

/* ===== services ===== */
export async function createService(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    const data = serviceSchema.parse(input);
    await db.insert(services).values({
      workspaceId: ctx.workspace.id,
      name: data.name,
      description: data.description ?? null,
      defaultPrice: data.defaultPrice != null ? String(data.defaultPrice) : null,
      defaultFrequency: data.defaultFrequency,
    });
    revalidateBilling();
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateService(serviceId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    const data = serviceSchema.parse(input);
    await db
      .update(services)
      .set({
        name: data.name,
        description: data.description ?? null,
        defaultPrice: data.defaultPrice != null ? String(data.defaultPrice) : null,
        defaultFrequency: data.defaultFrequency,
      })
      .where(and(eq(services.id, serviceId), eq(services.workspaceId, ctx.workspace.id)));
    revalidateBilling();
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function archiveService(serviceId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    await db
      .update(services)
      .set({ archivedAt: new Date() })
      .where(and(eq(services.id, serviceId), eq(services.workspaceId, ctx.workspace.id)));
    revalidateBilling();
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/* ===== subscriptions ===== */
export async function createSubscription(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    const data = subscriptionSchema.parse(input);
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, data.clientId), eq(clients.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (!client) throw new Error("Client not found in this workspace.");
    const [svc] = await db
      .select({ id: services.id, name: services.name })
      .from(services)
      .where(and(eq(services.id, data.serviceId), eq(services.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (!svc) throw new Error("Service not found in this workspace.");

    const [row] = await db
      .insert(subscriptions)
      .values({
        workspaceId: ctx.workspace.id,
        clientId: data.clientId,
        serviceId: data.serviceId,
        amount: String(data.amount),
        frequency: data.frequency,
        status: data.status,
        startDate: data.startDate,
        nextBillingDate: data.nextBillingDate ?? null,
      })
      .returning();
    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "subscription.created", entityType: "subscription", entityId: row.id, clientId: data.clientId,
      metadata: { service: svc.name, amount: data.amount, frequency: data.frequency },
    });
    revalidateBilling(data.clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function setSubscriptionStatus(
  subscriptionId: string,
  status: "active" | "paused" | "canceled"
): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (!sub) throw new Error("Subscription not found in this workspace.");
    await db
      .update(subscriptions)
      .set({
        status,
        pausedAt: status === "paused" ? new Date() : null,
        canceledAt: status === "canceled" ? new Date() : sub.canceledAt,
      })
      .where(eq(subscriptions.id, subscriptionId));
    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: `subscription.${status === "active" ? "resumed" : status}`,
      entityType: "subscription", entityId: subscriptionId, clientId: sub.clientId,
    });
    revalidateBilling(sub.clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/* ===== invoices ===== */
export async function createInvoice(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorize("manager");
    const data = invoiceSchema.parse(input);
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, data.clientId), eq(clients.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (!client) throw new Error("Client not found in this workspace.");

    const total = roundCents(data.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0));

    const invoiceId = await db.transaction(async (tx) => {
      const [inv] = await tx
        .insert(invoices)
        .values({
          workspaceId: ctx.workspace.id,
          clientId: data.clientId,
          number: data.number,
          status: data.status,
          issueDate: data.issueDate ?? null,
          dueDate: data.dueDate ?? null,
          total: String(total),
        })
        .returning();
      await tx.insert(invoiceItems).values(
        data.items.map((i) => ({
          invoiceId: inv.id,
          description: i.description,
          quantity: String(i.quantity),
          unitPrice: String(i.unitPrice),
          amount: String(roundCents(i.quantity * i.unitPrice)),
        }))
      );
      return inv.id;
    });

    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "invoice.created", entityType: "invoice", entityId: invoiceId, clientId: data.clientId,
      metadata: { number: data.number, total },
    });
    revalidateBilling(data.clientId);
    return { ok: true, data: { id: invoiceId } };
  } catch (err) {
    if (err instanceof Error && err.message.includes("invoices_workspace_number_unique")) {
      return { ok: false, error: "That invoice number is already used in this workspace." };
    }
    return actionError(err);
  }
}

export async function setInvoiceStatus(invoiceId: string, status: "open" | "void"): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (!inv) throw new Error("Invoice not found in this workspace.");
    if (inv.status === "paid") throw new Error("Paid invoices cannot be changed.");
    await db
      .update(invoices)
      .set({ status, voidedAt: status === "void" ? new Date() : null })
      .where(eq(invoices.id, invoiceId));
    revalidateBilling(inv.clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/** Convenience: records a payment for the remaining balance and marks the invoice paid. */
export async function markInvoicePaid(invoiceId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (!inv) throw new Error("Invoice not found in this workspace.");
    const balance = roundCents(toAmount(inv.total) - toAmount(inv.amountPaid));
    if (balance <= 0) throw new Error("This invoice has no remaining balance.");
    await db.transaction(async (tx) => {
      await tx.insert(payments).values({
        workspaceId: ctx.workspace.id,
        clientId: inv.clientId,
        invoiceId: inv.id,
        amount: String(balance),
        status: "succeeded",
        method: "manual",
        paidAt: new Date(),
      });
      await tx
        .update(invoices)
        .set({ amountPaid: inv.total, status: "paid" })
        .where(eq(invoices.id, inv.id));
    });
    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "payment.recorded", entityType: "payment", clientId: inv.clientId,
      metadata: { amount: balance, invoice: inv.number },
    });
    revalidateBilling(inv.clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/* ===== payments ===== */
export async function recordPayment(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    const data = paymentSchema.parse(input);

    let invoice = null;
    if (data.invoiceId) {
      const [inv] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, data.invoiceId), eq(invoices.workspaceId, ctx.workspace.id)))
        .limit(1);
      if (!inv) throw new Error("Invoice not found in this workspace.");
      invoice = inv;
    }
    if (data.clientId) {
      const [client] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.id, data.clientId), eq(clients.workspaceId, ctx.workspace.id)))
        .limit(1);
      if (!client) throw new Error("Client not found in this workspace.");
    }

    await db.transaction(async (tx) => {
      await tx.insert(payments).values({
        workspaceId: ctx.workspace.id,
        clientId: data.clientId ?? invoice?.clientId ?? null,
        invoiceId: data.invoiceId ?? null,
        amount: String(data.amount),
        status: data.status,
        method: data.method ?? null,
        reference: data.reference ?? null,
        paidAt: new Date(data.paidAt),
      });
      if (invoice && data.status === "succeeded") {
        const newPaid = roundCents(toAmount(invoice.amountPaid) + data.amount);
        const paidInFull = newPaid >= toAmount(invoice.total);
        await tx
          .update(invoices)
          .set({ amountPaid: String(newPaid), status: paidInFull ? "paid" : invoice.status })
          .where(eq(invoices.id, invoice.id));
      }
    });

    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "payment.recorded", entityType: "payment",
      clientId: data.clientId ?? invoice?.clientId ?? null,
      metadata: { amount: data.amount, method: data.method ?? undefined },
    });
    revalidateBilling(data.clientId ?? invoice?.clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
