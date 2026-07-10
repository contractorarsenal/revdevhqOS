"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { services, subscriptions, invoices, invoiceItems, payments, clients, expenses } from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { logActivity } from "@/server/activity";
import { serviceSchema, subscriptionSchema, invoiceSchema, paymentSchema, expenseSchema } from "@/lib/validation";
import { roundCents, toAmount, recalcInvoiceAfterVoid, paymentAttribution, currentDueMonth } from "@/lib/finance/metrics";

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
        paymentDay: data.paymentDay ?? null,
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
          billingFrequency: data.billingFrequency,
          billingMonth: data.billingMonth
            ? `${data.billingMonth}-01`
            : data.issueDate
              ? `${data.issueDate.slice(0, 7)}-01`
              : `${new Date().toISOString().slice(0, 7)}-01`,
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
        paymentType: inv.billingFrequency === "monthly" ? "monthly" : "one_time",
        billingMonth: inv.billingMonth ?? `${new Date().toISOString().slice(0, 7)}-01`,
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

    // The invoice is authoritative for attribution: payments applied to an
    // invoice always belong to the invoice's client and inherit its billing
    // metadata — a mismatched request clientId cannot shift revenue between
    // clients while reducing another client's invoice balance.
    const attribution = paymentAttribution(invoice, {
      clientId: data.clientId,
      paymentType: data.paymentType,
      billingMonth: data.billingMonth ? `${data.billingMonth}-01` : null,
    });
    const billingMonth = attribution.billingMonth ?? `${data.paidAt.slice(0, 7)}-01`;

    await db.transaction(async (tx) => {
      await tx.insert(payments).values({
        workspaceId: ctx.workspace.id,
        clientId: attribution.clientId,
        invoiceId: data.invoiceId ?? null,
        amount: String(data.amount),
        status: data.status,
        paymentType: attribution.paymentType as typeof data.paymentType,
        billingMonth,
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
      clientId: attribution.clientId,
      metadata: { amount: data.amount, method: data.method ?? undefined },
    });
    revalidateBilling(attribution.clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/**
 * Soft-removes a payment: status becomes "voided" (excluded from every
 * revenue total and report), the row is kept for audit, and any linked
 * invoice has its paid amount and status recalculated in the same
 * transaction. Owners/admins only.
 */
export async function voidPayment(paymentId: string, reason?: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("admin");
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (!payment) throw new Error("Payment not found in this workspace.");
    if (payment.status === "voided") throw new Error("This payment is already removed.");

    const wasRevenue = payment.status === "succeeded";
    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({
          status: "voided",
          voidedAt: new Date(),
          voidedBy: ctx.user.id,
          voidReason: reason ?? null,
        })
        .where(eq(payments.id, payment.id));

      if (payment.invoiceId && wasRevenue) {
        const [inv] = await tx.select().from(invoices).where(eq(invoices.id, payment.invoiceId)).limit(1);
        if (inv) {
          const next = recalcInvoiceAfterVoid(inv, payment.amount);
          await tx
            .update(invoices)
            .set({ amountPaid: String(next.amountPaid), status: next.status as typeof inv.status })
            .where(eq(invoices.id, inv.id));
        }
      }
    });

    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "payment.voided", entityType: "payment", entityId: payment.id, clientId: payment.clientId,
      metadata: { amount: Number(payment.amount), reason: reason ?? undefined },
    });
    revalidateBilling(payment.clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/** Edits an existing subscription's billing terms (amount, day, status, etc). */
export async function updateSubscription(subscriptionId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    const data = subscriptionSchema.parse(input);
    const [existing] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (!existing) throw new Error("Subscription not found in this workspace.");
    await db
      .update(subscriptions)
      .set({
        amount: String(data.amount),
        frequency: data.frequency,
        status: data.status,
        startDate: data.startDate,
        nextBillingDate: data.nextBillingDate ?? null,
        paymentDay: data.paymentDay ?? null,
      })
      .where(eq(subscriptions.id, subscriptionId));
    revalidateBilling(data.clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/**
 * Records the current due month's payment for an active monthly
 * subscription — the "Mark collected" action. Blocks a duplicate for the
 * same subscription + billing month (unless the existing one was voided).
 */
export async function markSubscriptionCollected(subscriptionId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (!sub) throw new Error("Subscription not found in this workspace.");

    const dueMonth = currentDueMonth(sub);
    if (!dueMonth) throw new Error("This subscription has no payment currently due.");

    const [dup] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(
        eq(payments.subscriptionId, sub.id),
        eq(payments.billingMonth, dueMonth),
        ne(payments.status, "voided")
      ))
      .limit(1);
    if (dup) throw new Error("A payment for this billing month has already been recorded.");

    await db.insert(payments).values({
      workspaceId: ctx.workspace.id,
      clientId: sub.clientId,
      subscriptionId: sub.id,
      amount: sub.amount,
      status: "succeeded",
      paymentType: "monthly",
      billingMonth: dueMonth,
      method: "manual",
      paidAt: new Date(),
    });

    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id,
      action: "payment.recorded", entityType: "payment", clientId: sub.clientId,
      metadata: { amount: Number(sub.amount), recurring: true, billingMonth: dueMonth },
    });
    revalidateBilling(sub.clientId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/* ===== expenses ===== */
export async function createExpense(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    const data = expenseSchema.parse(input);
    await db.insert(expenses).values({
      workspaceId: ctx.workspace.id,
      name: data.name,
      category: data.category,
      amount: String(data.amount),
      expenseDate: data.expenseDate,
      frequency: data.frequency,
      vendor: data.vendor ?? null,
      notes: data.notes ?? null,
      createdBy: ctx.user.id,
    });
    revalidatePath("/expenses");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateExpense(expenseId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    const data = expenseSchema.parse(input);
    await db
      .update(expenses)
      .set({
        name: data.name,
        category: data.category,
        amount: String(data.amount),
        expenseDate: data.expenseDate,
        frequency: data.frequency,
        vendor: data.vendor ?? null,
        notes: data.notes ?? null,
      })
      .where(and(eq(expenses.id, expenseId), eq(expenses.workspaceId, ctx.workspace.id)));
    revalidatePath("/expenses");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function archiveExpense(expenseId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    await db
      .update(expenses)
      .set({ status: "archived", archivedAt: new Date() })
      .where(and(eq(expenses.id, expenseId), eq(expenses.workspaceId, ctx.workspace.id)));
    revalidatePath("/expenses");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
