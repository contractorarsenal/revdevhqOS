import "server-only";
import { and, eq, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { payments, clients, subscriptions, services } from "@/lib/db/schema";
import { calculateMrr, roundCents } from "@/lib/finance/metrics";

export async function getRevenueByClient(workspaceId: string, limit = 10) {
  return db
    .select({
      clientId: clients.id,
      clientName: clients.name,
      collected: sql<string>`coalesce(sum(${payments.amount}), 0)`,
      paymentCount: sql<number>`count(${payments.id})`,
    })
    .from(payments)
    .innerJoin(clients, eq(payments.clientId, clients.id))
    .where(and(eq(payments.workspaceId, workspaceId), eq(payments.status, "succeeded")))
    .groupBy(clients.id, clients.name)
    .orderBy(desc(sql`sum(${payments.amount})`))
    .limit(limit);
}

export async function getMrrByService(workspaceId: string) {
  const rows = await db
    .select({
      serviceName: services.name,
      amount: subscriptions.amount,
      frequency: subscriptions.frequency,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .innerJoin(services, eq(subscriptions.serviceId, services.id))
    .where(eq(subscriptions.workspaceId, workspaceId));

  const byService = new Map<string, { amount: string; frequency: typeof rows[number]["frequency"]; status: string }[]>();
  for (const r of rows) {
    const list = byService.get(r.serviceName) ?? [];
    list.push(r);
    byService.set(r.serviceName, list);
  }
  return [...byService.entries()]
    .map(([name, subs]) => ({ name, mrr: roundCents(calculateMrr(subs)) }))
    .filter((s) => s.mrr > 0)
    .sort((a, b) => b.mrr - a.mrr);
}
