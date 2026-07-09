import "server-only";
import { and, eq, desc, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { services, subscriptions, invoices, payments, clients } from "@/lib/db/schema";

export async function listServices(workspaceId: string, includeArchived = false) {
  return db
    .select()
    .from(services)
    .where(
      includeArchived
        ? eq(services.workspaceId, workspaceId)
        : and(eq(services.workspaceId, workspaceId), isNull(services.archivedAt))
    )
    .orderBy(services.name);
}

export async function listSubscriptions(workspaceId: string) {
  return db
    .select({
      id: subscriptions.id,
      amount: subscriptions.amount,
      frequency: subscriptions.frequency,
      status: subscriptions.status,
      startDate: subscriptions.startDate,
      nextBillingDate: subscriptions.nextBillingDate,
      clientId: clients.id,
      clientName: clients.name,
      serviceName: services.name,
    })
    .from(subscriptions)
    .innerJoin(clients, eq(subscriptions.clientId, clients.id))
    .innerJoin(services, eq(subscriptions.serviceId, services.id))
    .where(eq(subscriptions.workspaceId, workspaceId))
    .orderBy(desc(subscriptions.createdAt));
}

export async function listInvoices(workspaceId: string) {
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      total: invoices.total,
      amountPaid: invoices.amountPaid,
      clientId: clients.id,
      clientName: clients.name,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(eq(invoices.workspaceId, workspaceId))
    .orderBy(desc(invoices.createdAt));
}

export async function listPayments(workspaceId: string) {
  return db
    .select({
      id: payments.id,
      amount: payments.amount,
      status: payments.status,
      method: payments.method,
      reference: payments.reference,
      paidAt: payments.paidAt,
      clientName: clients.name,
      invoiceId: payments.invoiceId,
    })
    .from(payments)
    .leftJoin(clients, eq(payments.clientId, clients.id))
    .where(eq(payments.workspaceId, workspaceId))
    .orderBy(desc(payments.paidAt));
}

export async function listActiveSubscriptionLikes(workspaceId: string) {
  return db
    .select({
      amount: subscriptions.amount,
      frequency: subscriptions.frequency,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId));
}
