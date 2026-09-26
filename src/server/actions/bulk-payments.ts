"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, invoices, payments, subscriptions } from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { logActivity } from "@/server/activity";
import { createPayment } from "@/server/services/payments";
import { bulkPaymentBatchSchema, type BulkPaymentRowInput } from "@/lib/validation";
import { invoiceBalance, roundCents, toAmount } from "@/lib/finance/metrics";
import { monthOf, softDuplicateKey, subscriptionMonthKey } from "@/lib/bulk-payments";
import { revalidateGoalPaths } from "./revalidate-goals";

export type BulkRowEvaluation = {
  rowId: string;
  /** Can be saved (possibly after confirming warnings). */
  ok: boolean;
  /** Hard stop — cannot be saved as entered. */
  blocked: boolean;
  /** Saveable only once the user explicitly confirms. */
  needsConfirm: boolean;
  messages: string[];
  clientName: string | null;
  appliesTo: string;
};

type Rows = BulkPaymentRowInput[];

/**
 * Server-side validation shared by preview AND submit — submit never trusts
 * a previous preview. Everything is checked against the caller's workspace;
 * ids from the browser are only lookup keys.
 */
async function evaluateRows(workspaceId: string, rows: Rows): Promise<BulkRowEvaluation[]> {
  const clientIds = [...new Set(rows.map((r) => r.clientId))];
  const subIds = [...new Set(rows.map((r) => r.subscriptionId).filter((v): v is string => Boolean(v)))];
  const invIds = [...new Set(rows.map((r) => r.invoiceId).filter((v): v is string => Boolean(v)))];

  const dates = rows.map((r) => r.paidAt).sort();
  const minDay = new Date(dates[0]);
  const maxDay = new Date(dates[dates.length - 1]);
  maxDay.setUTCDate(maxDay.getUTCDate() + 1);

  const [clientRows, subRows, invRows, sameDayPayments, subPayments] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients).where(and(eq(clients.workspaceId, workspaceId), inArray(clients.id, clientIds))),
    subIds.length ? db.select().from(subscriptions).where(and(eq(subscriptions.workspaceId, workspaceId), inArray(subscriptions.id, subIds))) : Promise.resolve([]),
    invIds.length ? db.select().from(invoices).where(and(eq(invoices.workspaceId, workspaceId), inArray(invoices.id, invIds))) : Promise.resolve([]),
    db
      .select({ clientId: payments.clientId, amount: payments.amount, paidAt: payments.paidAt })
      .from(payments)
      .where(and(eq(payments.workspaceId, workspaceId), inArray(payments.clientId, clientIds), ne(payments.status, "voided"), gte(payments.paidAt, minDay), lt(payments.paidAt, maxDay))),
    subIds.length
      ? db.select({ subscriptionId: payments.subscriptionId, billingMonth: payments.billingMonth }).from(payments)
          .where(and(eq(payments.workspaceId, workspaceId), inArray(payments.subscriptionId, subIds), ne(payments.status, "voided")))
      : Promise.resolve([]),
  ]);

  const clientName = new Map(clientRows.map((c) => [c.id, c.name]));
  const subById = new Map(subRows.map((s) => [s.id, s]));
  const invById = new Map(invRows.map((i) => [i.id, i]));
  const existingSoft = new Set(sameDayPayments.map((p) => softDuplicateKey({ clientId: p.clientId as string, amount: toAmount(p.amount), paidAt: p.paidAt.toISOString().slice(0, 10) })));
  const existingSubMonth = new Set(subPayments.map((p) => subscriptionMonthKey(p.subscriptionId as string, String(p.billingMonth).slice(0, 7))));

  const seenSoft = new Set<string>();
  const seenSubMonth = new Set<string>();
  const seenInvoiceTotals = new Map<string, number>();

  return rows.map((r) => {
    const messages: string[] = [];
    let blocked = false;
    let needsConfirm = false;
    let appliesTo = "Unallocated payment";

    if (!clientName.has(r.clientId)) {
      messages.push("Client not found in this workspace.");
      blocked = true;
    }
    if (r.invoiceId && r.subscriptionId) {
      messages.push("Choose an invoice or a subscription, not both.");
      blocked = true;
    }

    if (r.subscriptionId) {
      const sub = subById.get(r.subscriptionId);
      if (!sub) { messages.push("Subscription not found."); blocked = true; }
      else if (sub.clientId !== r.clientId) { messages.push("That subscription belongs to a different client."); blocked = true; }
      else {
        appliesTo = `Subscription · ${r.billingMonth ?? monthOf(r.paidAt)}`;
        const key = subscriptionMonthKey(sub.id, r.billingMonth ?? monthOf(r.paidAt));
        if (existingSubMonth.has(key)) { messages.push("A payment for this subscription and billing month is already recorded."); blocked = true; }
        else if (seenSubMonth.has(key)) { messages.push("Another row in this batch already covers this subscription and month."); blocked = true; }
        seenSubMonth.add(key);
      }
    }

    if (r.invoiceId) {
      const inv = invById.get(r.invoiceId);
      if (!inv) { messages.push("Invoice not found."); blocked = true; }
      else if (inv.clientId !== r.clientId) { messages.push("That invoice belongs to a different client."); blocked = true; }
      else if (inv.status === "paid" || inv.status === "void" || inv.status === "draft") { messages.push(`Invoice ${inv.number} is ${inv.status}.`); blocked = true; }
      else {
        appliesTo = `Invoice ${inv.number}`;
        const already = seenInvoiceTotals.get(inv.id) ?? 0;
        const remaining = roundCents(invoiceBalance(inv) - already);
        if (r.amount > remaining) { messages.push(`Exceeds the remaining balance (${remaining.toFixed(2)}).`); needsConfirm = true; }
        seenInvoiceTotals.set(inv.id, already + r.amount);
      }
    }

    const softKey = softDuplicateKey(r);
    if (existingSoft.has(softKey)) { messages.push("A payment with the same client, amount, and date already exists."); needsConfirm = true; }
    else if (seenSoft.has(softKey)) { messages.push("Same client, amount, and date as another row in this batch."); needsConfirm = true; }
    seenSoft.add(softKey);

    return {
      rowId: r.rowId, ok: !blocked, blocked, needsConfirm, messages,
      clientName: clientName.get(r.clientId) ?? null, appliesTo,
    };
  });
}

export async function previewBulkPayments(input: unknown): Promise<ActionResult<{ rows: BulkRowEvaluation[] }>> {
  try {
    const ctx = await authorize("manager");
    const { rows } = bulkPaymentBatchSchema.parse(input);
    return { ok: true, data: { rows: await evaluateRows(ctx.workspace.id, rows) } };
  } catch (err) {
    return actionError(err);
  }
}

export type BulkSaveResult = { rowId: string; ok: boolean; error?: string; paymentId?: string };

/** Saves every valid row independently — one failing row never rolls back the
 * others, and each result is reported back per row. */
export async function submitBulkPayments(input: unknown): Promise<ActionResult<{ results: BulkSaveResult[]; savedCount: number; savedTotal: number }>> {
  try {
    const ctx = await authorize("manager");
    const batch = bulkPaymentBatchSchema.parse(input);
    const evals = await evaluateRows(ctx.workspace.id, batch.rows);
    const confirmed = new Set(batch.confirmedDuplicateRowIds);
    const batchId = randomUUID();

    const results: BulkSaveResult[] = [];
    let savedTotal = 0;
    const touchedClients = new Set<string>();

    for (const row of batch.rows) {
      const ev = evals.find((e) => e.rowId === row.rowId)!;
      if (ev.blocked) { results.push({ rowId: row.rowId, ok: false, error: ev.messages[0] ?? "This row can't be saved." }); continue; }
      if (ev.needsConfirm && !confirmed.has(row.rowId)) { results.push({ rowId: row.rowId, ok: false, error: "Confirm the warning to record this payment." }); continue; }
      try {
        const { clientId, paymentId } = await createPayment(ctx.workspace.id, {
          clientId: row.clientId, invoiceId: row.invoiceId, subscriptionId: row.subscriptionId,
          amount: row.amount, status: "succeeded", paymentType: "one_time",
          billingMonth: row.subscriptionId ? (row.billingMonth ?? monthOf(row.paidAt)) : null,
          method: row.method, reference: row.reference, note: row.note, paidAt: row.paidAt,
        });
        await logActivity({
          workspaceId: ctx.workspace.id, actorId: ctx.user.id,
          action: "payment.recorded", entityType: "payment", entityId: paymentId, clientId,
          metadata: { amount: row.amount, method: row.method ?? undefined, source: "bulk", batchId },
        });
        results.push({ rowId: row.rowId, ok: true, paymentId });
        savedTotal += row.amount;
        if (clientId) touchedClients.add(clientId);
      } catch (err) {
        results.push({ rowId: row.rowId, ok: false, error: actionError(err).error });
      }
    }

    revalidatePath("/billing");
    revalidatePath("/dashboard");
    for (const id of touchedClients) revalidatePath(`/clients/${id}`);
    revalidateGoalPaths();
    return { ok: true, data: { results, savedCount: results.filter((r) => r.ok).length, savedTotal: roundCents(savedTotal) } };
  } catch (err) {
    return actionError(err);
  }
}
