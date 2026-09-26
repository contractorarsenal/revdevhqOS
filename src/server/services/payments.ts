import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, invoices, payments, subscriptions } from "@/lib/db/schema";
import { paymentAttribution, roundCents, toAmount } from "@/lib/finance/metrics";

export type NewPayment = {
  clientId?: string | null;
  invoiceId?: string | null;
  subscriptionId?: string | null;
  amount: number;
  status: "pending" | "succeeded" | "failed" | "refunded";
  paymentType: "one_time" | "monthly";
  /** "YYYY-MM" */
  billingMonth?: string | null;
  method?: string | null;
  reference?: string | null;
  note?: string | null;
  /** "YYYY-MM-DD" */
  paidAt: string;
};

export const SUBSCRIPTION_MONTH_CONSTRAINT = "payments_subscription_billing_month_unique";

/**
 * THE payment-creation path. recordPayment and bulk entry both call this, so
 * every billing safeguard lives in exactly one place:
 *  - invoice / client / subscription must belong to the workspace
 *  - an invoice is authoritative for attribution (client, type, month)
 *  - invoice balance is re-read under a row lock before being updated
 *  - a subscription payment is guarded by the partial unique index
 *    (subscription_id, billing_month) for non-voided payments
 */
export async function createPayment(workspaceId: string, data: NewPayment): Promise<{ clientId: string | null; paymentId: string }> {
  if (data.invoiceId && data.subscriptionId) throw new Error("A payment applies to an invoice or a subscription, not both.");

  let invoice = null;
  if (data.invoiceId) {
    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, data.invoiceId), eq(invoices.workspaceId, workspaceId)))
      .limit(1);
    if (!inv) throw new Error("Invoice not found in this workspace.");
    invoice = inv;
  }

  let sub: typeof subscriptions.$inferSelect | null = null;
  if (data.subscriptionId) {
    const [s] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, data.subscriptionId), eq(subscriptions.workspaceId, workspaceId)))
      .limit(1);
    if (!s) throw new Error("Subscription not found in this workspace.");
    if (data.clientId && data.clientId !== s.clientId) throw new Error("That subscription belongs to a different client.");
    sub = s;
  }

  const requestedClientId = sub?.clientId ?? data.clientId ?? null;
  if (requestedClientId) {
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, requestedClientId), eq(clients.workspaceId, workspaceId)))
      .limit(1);
    if (!client) throw new Error("Client not found in this workspace.");
  }

  // The invoice is authoritative for attribution: payments applied to an
  // invoice always belong to the invoice's client and inherit its billing
  // metadata — a mismatched request clientId cannot shift revenue between
  // clients while reducing another client's invoice balance.
  const attribution = paymentAttribution(invoice, {
    clientId: requestedClientId,
    paymentType: sub ? (sub.frequency === "monthly" ? "monthly" : "one_time") : data.paymentType,
    billingMonth: data.billingMonth ? `${data.billingMonth}-01` : null,
  });
  const billingMonth = attribution.billingMonth ?? `${data.paidAt.slice(0, 7)}-01`;

  try {
    const paymentId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(payments)
        .values({
          workspaceId,
          clientId: attribution.clientId,
          invoiceId: data.invoiceId ?? null,
          subscriptionId: data.subscriptionId ?? null,
          amount: String(data.amount),
          status: data.status,
          paymentType: attribution.paymentType as typeof data.paymentType,
          billingMonth,
          method: data.method ?? null,
          reference: data.reference ?? null,
          note: data.note ?? null,
          paidAt: new Date(data.paidAt),
        })
        .returning({ id: payments.id });
      if (invoice && data.status === "succeeded") {
        // Re-read under a row lock immediately before computing the new
        // balance — the pre-transaction `invoice` read above is only used
        // for attribution (clientId/type/month), which can't race; the
        // actual balance must come from a locked, current value or two
        // concurrent payments would both add to the same stale amountPaid.
        const [locked] = await tx.select().from(invoices).where(eq(invoices.id, invoice.id)).for("update");
        const newPaid = roundCents(toAmount(locked.amountPaid) + data.amount);
        const paidInFull = newPaid >= toAmount(locked.total);
        await tx
          .update(invoices)
          .set({ amountPaid: String(newPaid), status: paidInFull ? "paid" : locked.status })
          .where(eq(invoices.id, locked.id));
      }
      return row.id;
    });
    return { clientId: attribution.clientId, paymentId };
  } catch (err) {
    // The constraint name lives on the driver error's .cause, not on
    // DrizzleQueryError#message.
    const cause = err instanceof Error ? (err.cause as { constraint?: string } | undefined) : undefined;
    if (cause?.constraint === SUBSCRIPTION_MONTH_CONSTRAINT) {
      throw new Error("A payment for that subscription and billing month has already been recorded.");
    }
    throw err;
  }
}
