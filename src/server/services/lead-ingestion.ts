import "server-only";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { logActivity } from "@/server/activity";
import type { ClientLeadStatus, LeadSource } from "@/lib/leads-client";

export type CreateClientLeadInput = {
  workspaceId: string;
  clientId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  requestedService?: string | null;
  source: LeadSource;
  /** When the lead actually came in — defaults to now(). Callers backfilling
   * from a webhook/CRM should pass the source system's real timestamp. */
  receivedAt?: Date;
  status?: ClientLeadStatus;
  estimatedValue?: number | null;
  notes?: string | null;
  /** Which channel created this lead — carried into the activity log so
   * "how did this lead get here" is always answerable, not itself an
   * authorization mechanism (callers authorize themselves before calling). */
  createdVia: "manual" | "website" | "webhook" | "api";
  /** Profile id of the human who created it; null for unattended automation. */
  actorId: string | null;
};

export type CreateClientLeadResult = { id: string };

/**
 * THE single canonical path for creating a lead FOR a client. Every
 * caller — today's internal manual-entry action, and future website
 * forms / webhooks / n8n automations — must insert through this function,
 * never write to the `leads` table directly, so lead creation semantics
 * (activity logging, default status, receivedAt handling) can never drift
 * between channels.
 *
 * This function does NOT authorize the caller — it trusts workspaceId and
 * clientId as already-verified by the caller (an authorize()/authorizePortal()
 * gate, or, for a future webhook, a signed/authenticated request resolved to
 * a specific workspace+client). It also does not validate `input`'s shape —
 * callers parse against their own zod schema first (manual entry uses
 * clientLeadManualEntrySchema; a future API would define its own).
 */
export async function createClientLead(input: CreateClientLeadInput): Promise<CreateClientLeadResult> {
  const [row] = await db
    .insert(leads)
    .values({
      workspaceId: input.workspaceId,
      clientId: input.clientId,
      // The `leads` table's `company` column is NOT NULL and used for
      // display (avatar initials, list rows) on the internal /leads page,
      // which lists every lead workspace-wide including client-generated
      // ones. Client leads have no "company" concept (their contact is
      // typically an individual customer) — reuse the person's name here
      // rather than relaxing a NOT NULL constraint other code depends on.
      company: input.name,
      contactName: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      serviceInterest: input.requestedService ?? null,
      source: input.source,
      status: input.status ?? "new",
      receivedAt: input.receivedAt ?? new Date(),
      estimatedValue: input.estimatedValue != null ? String(input.estimatedValue) : null,
      notes: input.notes ?? null,
    })
    .returning({ id: leads.id });

  await logActivity({
    workspaceId: input.workspaceId, actorId: input.actorId,
    action: "lead.created", entityType: "lead", entityId: row.id, leadId: row.id, clientId: input.clientId,
    metadata: { source: input.source, via: input.createdVia, clientLead: true },
  });

  return { id: row.id };
}
