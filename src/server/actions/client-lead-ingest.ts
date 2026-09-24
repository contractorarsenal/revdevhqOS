"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { clientLeadIngestSchema } from "@/lib/validation";
import {
  INGEST_CLIENT_LEAD_ERROR,
  classifyCaClientLeadScope,
  ingestClientLeadParseError,
} from "@/lib/client-lead-ingest";
import { assertDateOnly, createClientLead } from "@/server/services/lead-ingestion";

function createdViaFor(source: "website" | "webhook" | "api" | "gmail" | "form"): "website" | "webhook" | "api" {
  if (source === "website") return "website";
  if (source === "webhook") return "webhook";
  return "api";
}

/**
 * Inbox & Leads entrypoint. One call, complete payload, no follow-up UPDATE
 * of external_message_id or dedupe_key. See src/lib/client-lead-ingest.ts
 * for the field list, error codes, and CA-client rule.
 *
 * ```ts
 * await ingestClientLead({
 *   clientId,            // allowlisted CA client uuid
 *   name,
 *   source: "Website",  // site forms; other LeadSource values are accepted
 *   receivedOn,          // "YYYY-MM-DD" calendar date
 *   externalMessageId,   // stable source id (Gmail message id, form id)
 *   dedupeKey,           // required even when externalMessageId is set
 *   ingestionSource,     // "gmail" | "form" | "website" | "webhook" | "api"
 *   email, phone, requestedService, // optional
 * });
 * ```
 */
export async function ingestClientLead(
  input: unknown,
): Promise<ActionResult<{ id: string; duplicate: boolean }>> {
  try {
    const ctx = await authorize("admin");
    const parsed = clientLeadIngestSchema.safeParse(input);
    if (!parsed.success) return ingestClientLeadParseError(parsed.error);

    const data = parsed.data;
    try {
      assertDateOnly(data.receivedOn);
    } catch (err) {
      const message = err instanceof Error ? err.message : "receivedOn must be YYYY-MM-DD";
      return { ok: false, error: message, code: INGEST_CLIENT_LEAD_ERROR.INVALID_DATE };
    }

    const [client] = await db
      .select({
        id: clients.id,
        status: clients.status,
        archivedAt: clients.archivedAt,
        industry: clients.industry,
      })
      .from(clients)
      .where(and(eq(clients.id, data.clientId), eq(clients.workspaceId, ctx.workspace.id)))
      .limit(1);

    if (!client || client.status !== "active" || client.archivedAt != null) {
      return {
        ok: false,
        error: client ? "Client is not an active workspace client." : "Client not found in this workspace.",
        code: INGEST_CLIENT_LEAD_ERROR.INVALID_CLIENT,
      };
    }

    const scope = classifyCaClientLeadScope({ id: client.id, industry: client.industry });
    if (!scope.ok) return { ok: false, error: scope.error, code: scope.code };

    // Keys are arguments to the single insert. There is no post-insert patch.
    const { id, duplicate } = await createClientLead({
      workspaceId: ctx.workspace.id,
      clientId: data.clientId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      requestedService: data.requestedService,
      source: data.source,
      receivedOn: data.receivedOn,
      externalMessageId: data.externalMessageId,
      dedupeKey: data.dedupeKey,
      ingestionSource: data.ingestionSource,
      createdVia: createdViaFor(data.ingestionSource),
      actorId: ctx.user.id,
    });

    revalidatePath(`/clients/${data.clientId}`);
    revalidatePath(`/clients/${data.clientId}/leads`);
    revalidatePath("/portal");
    revalidatePath("/portal/leads");
    return { ok: true, data: { id, duplicate } };
  } catch (err) {
    const result = actionError(err);
    if (result.error === "You do not have permission to perform this action.") {
      return { ...result, code: INGEST_CLIENT_LEAD_ERROR.FORBIDDEN };
    }
    return result;
  }
}
