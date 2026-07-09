import "server-only";
import { and, eq, desc, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  clients, contacts, subscriptions, services, invoices, payments, tasks, notes,
  activityLogs, users, clientOnboarding,
} from "@/lib/db/schema";
import { calculateMrr, type SubscriptionLike } from "@/lib/finance/metrics";

export type ClientRow = Awaited<ReturnType<typeof listClients>>[number];

export async function listClients(workspaceId: string) {
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      status: clients.status,
      industry: clients.industry,
      email: clients.email,
      startDate: clients.startDate,
      createdAt: clients.createdAt,
      ownerId: clients.ownerId,
      ownerName: users.name,
    })
    .from(clients)
    .leftJoin(users, eq(clients.ownerId, users.id))
    .where(eq(clients.workspaceId, workspaceId))
    .orderBy(desc(clients.createdAt));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const subs = await db
    .select({
      clientId: subscriptions.clientId,
      amount: subscriptions.amount,
      frequency: subscriptions.frequency,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .where(and(eq(subscriptions.workspaceId, workspaceId), inArray(subscriptions.clientId, ids)));

  const primaries = await db
    .select({ clientId: contacts.clientId, name: contacts.name, email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspaceId), inArray(contacts.clientId, ids), eq(contacts.isPrimary, true)));

  const pastDueByClient = await db
    .select({
      clientId: invoices.clientId,
      balance: sql<string>`sum(${invoices.total} - ${invoices.amountPaid})`,
    })
    .from(invoices)
    .where(and(
      eq(invoices.workspaceId, workspaceId),
      inArray(invoices.clientId, ids),
      inArray(invoices.status, ["open", "past_due"]),
      sql`${invoices.dueDate} < current_date`
    ))
    .groupBy(invoices.clientId);

  const subMap = new Map<string, SubscriptionLike[]>();
  for (const s of subs) {
    const list = subMap.get(s.clientId) ?? [];
    list.push(s);
    subMap.set(s.clientId, list);
  }
  const contactMap = new Map(primaries.map((p) => [p.clientId, p]));
  const pastDueMap = new Map(pastDueByClient.map((p) => [p.clientId, Number(p.balance ?? 0)]));

  return rows.map((r) => ({
    ...r,
    mrr: calculateMrr(subMap.get(r.id) ?? []),
    primaryContact: contactMap.get(r.id) ?? null,
    pastDueBalance: pastDueMap.get(r.id) ?? 0,
    serviceCount: (subMap.get(r.id) ?? []).filter((s) => s.status === "active").length,
  }));
}

export async function getClientDetail(workspaceId: string, clientId: string) {
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
    .limit(1);
  if (!client) return null;

  const [owner] = client.ownerId
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, client.ownerId)).limit(1)
    : [null];

  const [clientContacts, clientSubs, clientInvoices, clientPayments, clientTasks, clientNotes, clientActivity, onboarding] =
    await Promise.all([
      db.select().from(contacts).where(and(eq(contacts.clientId, clientId), eq(contacts.workspaceId, workspaceId))).orderBy(desc(contacts.isPrimary), contacts.createdAt),
      db
        .select({
          id: subscriptions.id, amount: subscriptions.amount, frequency: subscriptions.frequency,
          status: subscriptions.status, startDate: subscriptions.startDate,
          nextBillingDate: subscriptions.nextBillingDate, serviceName: services.name,
        })
        .from(subscriptions)
        .innerJoin(services, eq(subscriptions.serviceId, services.id))
        .where(and(eq(subscriptions.clientId, clientId), eq(subscriptions.workspaceId, workspaceId)))
        .orderBy(desc(subscriptions.createdAt)),
      db.select().from(invoices).where(and(eq(invoices.clientId, clientId), eq(invoices.workspaceId, workspaceId))).orderBy(desc(invoices.createdAt)),
      db.select().from(payments).where(and(eq(payments.clientId, clientId), eq(payments.workspaceId, workspaceId))).orderBy(desc(payments.paidAt)).limit(25),
      db.select().from(tasks).where(and(eq(tasks.clientId, clientId), eq(tasks.workspaceId, workspaceId))).orderBy(desc(tasks.createdAt)),
      db.select().from(notes).where(and(eq(notes.clientId, clientId), eq(notes.workspaceId, workspaceId))).orderBy(desc(notes.pinned), desc(notes.createdAt)),
      db
        .select({
          id: activityLogs.id, action: activityLogs.action, metadata: activityLogs.metadata,
          createdAt: activityLogs.createdAt, actorName: users.name,
        })
        .from(activityLogs)
        .leftJoin(users, eq(activityLogs.actorId, users.id))
        .where(and(eq(activityLogs.clientId, clientId), eq(activityLogs.workspaceId, workspaceId)))
        .orderBy(desc(activityLogs.createdAt))
        .limit(30),
      db.select().from(clientOnboarding).where(and(eq(clientOnboarding.clientId, clientId), eq(clientOnboarding.workspaceId, workspaceId))).orderBy(clientOnboarding.position),
    ]);

  return {
    client,
    ownerName: owner?.name ?? null,
    contacts: clientContacts,
    subscriptions: clientSubs,
    invoices: clientInvoices,
    payments: clientPayments,
    tasks: clientTasks,
    notes: clientNotes,
    activity: clientActivity,
    onboarding,
    mrr: calculateMrr(clientSubs),
    lifetimeCollected: clientPayments
      .filter((p) => p.status === "succeeded")
      .reduce((sum, p) => sum + Number(p.amount), 0),
  };
}
