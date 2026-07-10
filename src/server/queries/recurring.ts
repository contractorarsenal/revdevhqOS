import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscriptions, clients, payments } from "@/lib/db/schema";
import { currentDueMonth, isDueLate } from "@/lib/finance/metrics";

/** Every active monthly subscription with money currently due, workspace-wide
 * (dashboard "due recurring payments" card, Billing "Due" tab). */
export async function listDueSubscriptions(workspaceId: string) {
  const subs = await db
    .select({
      id: subscriptions.id, clientId: subscriptions.clientId, clientName: clients.name,
      amount: subscriptions.amount, frequency: subscriptions.frequency, status: subscriptions.status,
      startDate: subscriptions.startDate, paymentDay: subscriptions.paymentDay,
    })
    .from(subscriptions)
    .innerJoin(clients, eq(subscriptions.clientId, clients.id))
    .where(and(eq(subscriptions.workspaceId, workspaceId), eq(subscriptions.status, "active"), eq(subscriptions.frequency, "monthly")));

  if (subs.length === 0) return [];
  const today = new Date();
  const candidates = subs
    .map((s) => ({ ...s, dueMonth: currentDueMonth(s, today) }))
    .filter((s): s is typeof s & { dueMonth: string } => s.dueMonth !== null);
  if (candidates.length === 0) return [];

  const collectedRows = await db
    .select({ subscriptionId: payments.subscriptionId, billingMonth: payments.billingMonth })
    .from(payments)
    .where(and(
      eq(payments.workspaceId, workspaceId),
      inArray(payments.subscriptionId, candidates.map((c) => c.id)),
      eq(payments.status, "succeeded")
    ));
  const collectedSet = new Set(collectedRows.map((r) => `${r.subscriptionId}:${r.billingMonth}`));

  return candidates
    .filter((c) => !collectedSet.has(`${c.id}:${c.dueMonth}`))
    .map((c) => ({ ...c, late: isDueLate(c.dueMonth, today, c.paymentDay) }));
}
