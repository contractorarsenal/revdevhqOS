import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscriptions, clients, payments } from "@/lib/db/schema";
import { currentDueMonth, isDueLate } from "@/lib/finance/metrics";
import { toDateOnlyString, todayInTimezone } from "@/lib/date-tz";

/** Every active monthly subscription with money currently due, workspace-wide
 * (dashboard "due recurring payments" card, Billing "Due" tab). */
export async function listDueSubscriptions(workspaceId: string, timezone: string) {
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
  // Workspace-local date anchored at noon UTC — see getClientBillingSummary.
  const today = new Date(`${todayInTimezone(timezone)}T12:00:00Z`);
  const candidates = subs
    .map((s) => ({ ...s, dueMonth: currentDueMonth(s, today) }))
    .filter((s): s is typeof s & { dueMonth: string } => s.dueMonth !== null);
  if (candidates.length === 0) return [];

  // "Collected" = any non-voided payment for the month — the same predicate
  // as markSubscriptionCollected's duplicate guard, so this card never shows
  // "due" for a month the collect action would refuse to record again.
  const collectedRows = await db
    .select({ subscriptionId: payments.subscriptionId, billingMonth: payments.billingMonth })
    .from(payments)
    .where(and(
      eq(payments.workspaceId, workspaceId),
      inArray(payments.subscriptionId, candidates.map((c) => c.id)),
      ne(payments.status, "voided")
    ));
  const collectedSet = new Set(collectedRows.map((r) => `${r.subscriptionId}:${toDateOnlyString(r.billingMonth)}`));

  return candidates
    .filter((c) => !collectedSet.has(`${c.id}:${c.dueMonth}`))
    .map((c) => ({ ...c, late: isDueLate(c.dueMonth, today, c.paymentDay) }));
}
