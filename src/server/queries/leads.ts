import "server-only";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { leads, users } from "@/lib/db/schema";

export type LeadRow = Awaited<ReturnType<typeof listLeads>>[number];

export async function listLeads(workspaceId: string) {
  return db
    .select({
      id: leads.id,
      company: leads.company,
      contactName: leads.contactName,
      email: leads.email,
      phone: leads.phone,
      source: leads.source,
      status: leads.status,
      serviceInterest: leads.serviceInterest,
      estimatedValue: leads.estimatedValue,
      estimatedMrr: leads.estimatedMrr,
      ownerId: leads.ownerId,
      ownerName: users.name,
      nextFollowUpAt: leads.nextFollowUpAt,
      lastContactedAt: leads.lastContactedAt,
      notes: leads.notes,
      convertedClientId: leads.convertedClientId,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .leftJoin(users, eq(leads.ownerId, users.id))
    .where(eq(leads.workspaceId, workspaceId))
    .orderBy(desc(leads.createdAt));
}
