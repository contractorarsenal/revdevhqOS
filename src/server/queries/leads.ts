import "server-only";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { leads, profiles } from "@/lib/db/schema";

export type LeadRow = Awaited<ReturnType<typeof listLeads>>[number];

/**
 * Contractor Arsenal sales prospects only. `client_id IS NULL` is the
 * definitive filter — leads generated FOR a client live in the separate
 * `client_leads` table (see the sales/client leads split). A handful of
 * pre-split rows with client_id still set are intentionally left dormant in
 * this table (never deleted, to avoid orphaning historical references) and
 * are excluded here so they can never resurface in the sales pipeline.
 */
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
      ownerName: profiles.name,
      nextFollowUpAt: leads.nextFollowUpAt,
      lastContactedAt: leads.lastContactedAt,
      notes: leads.notes,
      convertedClientId: leads.convertedClientId,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .leftJoin(profiles, eq(leads.ownerId, profiles.id))
    .where(and(eq(leads.workspaceId, workspaceId), isNull(leads.clientId)))
    .orderBy(desc(leads.createdAt));
}
