import "server-only";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscriptions, services, invoices, payments } from "@/lib/db/schema";
import { calculateMrr, currentDueMonth, isDueLate, nextPaymentFor } from "@/lib/finance/metrics";

/** Client-scoped billing summary for the client detail page — avoids
 * loading the whole workspace's invoices/payments just to show one client. */
export async function getClientBillingSummary(workspaceId: string, clientId: string) {
  const [subs, clientInvoices, clientPayments] = await Promise.all([
    db
      .select({
        id: subscriptions.id, clientId: subscriptions.clientId, amount: subscriptions.amount, frequency: subscriptions.frequency,
        status: subscriptions.status, startDate: subscriptions.startDate, paymentDay: subscriptions.paymentDay,
        nextBillingDate: subscriptions.nextBillingDate, serviceId: subscriptions.serviceId, serviceName: services.name,
      })
      .from(subscriptions)
      .innerJoin(services, eq(subscriptions.serviceId, services.id))
      .where(and(eq(subscriptions.clientId, clientId), eq(subscriptions.workspaceId, workspaceId)))
      .orderBy(desc(subscriptions.createdAt)),
    db.select().from(invoices).where(and(eq(invoices.clientId, clientId), eq(invoices.workspaceId, workspaceId))).orderBy(desc(invoices.createdAt)),
    db.select().from(payments).where(and(eq(payments.clientId, clientId), eq(payments.workspaceId, workspaceId))).orderBy(desc(payments.paidAt)),
  ]);

  const today = new Date();
  const due = subs
    .filter((s) => s.status === "active" && s.frequency === "monthly")
    .map((s) => {
      const dueMonth = currentDueMonth(s, today);
      if (!dueMonth) return null;
      const collected = clientPayments.some(
        (p) => p.subscriptionId === s.id && p.billingMonth === dueMonth && p.status !== "voided"
      );
      return {
        subscriptionId: s.id, serviceName: s.serviceName, amount: s.amount,
        dueMonth, collected, late: !collected && isDueLate(dueMonth, today, s.paymentDay),
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)
    // "Due" means action is needed — once collected, it drops off this list.
    .filter((d) => !d.collected);

  // "Next payment" projects forward across every active monthly subscription
  // — once the currently-owed cycle is collected it advances to the
  // following month rather than disappearing or re-showing a paid period.
  const nextPayments = subs
    .map((s) => {
      const info = nextPaymentFor(s, (billingMonth) =>
        clientPayments.some((p) => p.subscriptionId === s.id && p.billingMonth === billingMonth && p.status !== "voided"),
        today
      );
      return info ? { subscriptionId: s.id, serviceName: s.serviceName, ...info } : null;
    })
    .filter((n): n is NonNullable<typeof n> => n !== null)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return {
    subscriptions: subs,
    invoices: clientInvoices,
    payments: clientPayments,
    mrr: calculateMrr(subs),
    lifetimeCollected: clientPayments.filter((p) => p.status === "succeeded").reduce((sum, p) => sum + Number(p.amount), 0),
    duePayments: due,
    nextPayment: nextPayments[0] ?? null,
  };
}
