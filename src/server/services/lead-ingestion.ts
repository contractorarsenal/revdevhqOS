import "server-only";
import { and, eq, sql, DrizzleQueryError } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientLeads } from "@/lib/db/schema";
import { logActivity } from "@/server/activity";
import type { ClientLeadStatus, LeadSource } from "@/lib/leads-client";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const externalMessageConflict = sql`${clientLeads.externalMessageId} is not null`;
const dedupeKeyConflict = sql`${clientLeads.dedupeKey} is not null`;

export type CreateClientLeadInput = {
  workspaceId: string;
  clientId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  requestedService?: string | null;
  source: LeadSource;
  /** True instant from the source system. Omit for a date-only entry;
   * the column then defaults to now() (UTC). Never pass `new Date("YYYY-MM-DD")`. */
  receivedAt?: Date;
  /** Calendar date when the source only has YYYY-MM-DD. Stored as a Postgres
   * date, not as a timestamp. */
  receivedOn?: string | null;
  externalMessageId?: string | null;
  dedupeKey?: string | null;
  ingestionSource?: string | null;
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

export type CreateClientLeadResult = { id: string; duplicate: boolean };

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

/** Reject impossible calendar dates without parsing them as UTC instants. */
export function assertDateOnly(value: string): string {
  if (!DATE_ONLY.test(value)) throw new Error("Date received must be YYYY-MM-DD.");
  const [year, month, day] = value.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    throw new Error("Date received is not a real calendar date.");
  }
  return value;
}

function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  return typeof cause === "object" && cause !== null && "code" in cause && (cause as { code?: string }).code === "23505";
}

async function findExisting(input: {
  workspaceId: string;
  clientId: string;
  externalMessageId: string | null;
  dedupeKey: string | null;
}): Promise<string | null> {
  if (input.externalMessageId) {
    const [row] = await db
      .select({ id: clientLeads.id })
      .from(clientLeads)
      .where(and(eq(clientLeads.workspaceId, input.workspaceId), eq(clientLeads.externalMessageId, input.externalMessageId)))
      .limit(1);
    if (row) return row.id;
  }
  if (input.dedupeKey) {
    const [row] = await db
      .select({ id: clientLeads.id })
      .from(clientLeads)
      .where(and(
        eq(clientLeads.workspaceId, input.workspaceId),
        eq(clientLeads.clientId, input.clientId),
        eq(clientLeads.dedupeKey, input.dedupeKey),
      ))
      .limit(1);
    if (row) return row.id;
  }
  return null;
}

/**
 * THE single canonical path for creating a lead FOR a client. Every
 * caller — today's internal manual-entry action, and future website
 * forms / webhooks / n8n automations — must insert through this function,
 * never write to the `client_leads` table directly, so lead creation
 * semantics (activity logging, default status, received-date handling,
 * duplicate suppression) can never drift between channels.
 *
 * A second insert with the same workspace external_message_id, or the same
 * workspace+client dedupe_key, returns the existing row. It does not insert
 * another lead and does not rewrite the existing one.
 *
 * This function does NOT authorize the caller — it trusts workspaceId and
 * clientId as already-verified by the caller.
 */
export async function createClientLead(input: CreateClientLeadInput): Promise<CreateClientLeadResult> {
  const externalMessageId = blankToNull(input.externalMessageId);
  const dedupeKey = blankToNull(input.dedupeKey);
  const receivedOn = input.receivedOn ? assertDateOnly(input.receivedOn.trim()) : null;
  const ingestionSource = blankToNull(input.ingestionSource) ?? input.createdVia;

  const identity = { workspaceId: input.workspaceId, clientId: input.clientId, externalMessageId, dedupeKey };
  const already = await findExisting(identity);
  if (already) return { id: already, duplicate: true };

  const values = {
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    requestedService: input.requestedService ?? null,
    source: input.source,
    status: input.status ?? "new",
    receivedAt: input.receivedAt ?? new Date(),
    estimatedValue: input.estimatedValue != null ? String(input.estimatedValue) : null,
    notes: input.notes ?? null,
    ingestionSource,
    ...(receivedOn ? { receivedOn } : {}),
    ...(externalMessageId ? { externalMessageId } : {}),
    ...(dedupeKey ? { dedupeKey } : {}),
  };

  let insertedId: string | undefined;
  try {
    const insert = db.insert(clientLeads).values(values);
    const rows = externalMessageId
      ? await insert.onConflictDoNothing({
          target: [clientLeads.workspaceId, clientLeads.externalMessageId],
          where: externalMessageConflict,
        }).returning({ id: clientLeads.id })
      : dedupeKey
        ? await insert.onConflictDoNothing({
            target: [clientLeads.workspaceId, clientLeads.clientId, clientLeads.dedupeKey],
            where: dedupeKeyConflict,
          }).returning({ id: clientLeads.id })
        : await insert.returning({ id: clientLeads.id });
    insertedId = rows[0]?.id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  if (!insertedId) {
    const existing = await findExisting(identity);
    if (!existing) throw new Error("Client lead already exists but could not be loaded.");
    return { id: existing, duplicate: true };
  }

  await logActivity({
    workspaceId: input.workspaceId, actorId: input.actorId,
    // entityId is a plain uuid column (no FK) precisely so activity can
    // point at rows in different tables like this one — never set the
    // FK-constrained leadId here, since client_leads.id lives outside the
    // leads table it references.
    action: "client_lead.created", entityType: "client_lead", entityId: insertedId, clientId: input.clientId,
    metadata: { source: input.source, via: input.createdVia },
  });

  return { id: insertedId, duplicate: false };
}
