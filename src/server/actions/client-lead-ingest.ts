"use server";

import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { INGEST_CLIENT_LEAD_ERROR } from "@/lib/client-lead-ingest";
import { executeClientLeadIngest } from "@/server/services/client-lead-ingest";

/**
 * In-app entrypoint (workspace admin session). Inbox & Leads cannot call
 * this — it has no browser session. Inbox POSTs `/api/ingest/client-lead`
 * with `Authorization: Bearer <CLIENT_LEAD_INGEST_SECRET>`. Both paths call
 * `executeClientLeadIngest`, which writes dedupe keys on the first insert.
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
    return await executeClientLeadIngest({
      input,
      actorId: ctx.user.id,
      workspaceId: ctx.workspace.id,
    });
  } catch (err) {
    const result = actionError(err);
    if (result.error === "You do not have permission to perform this action.") {
      return { ...result, code: INGEST_CLIENT_LEAD_ERROR.FORBIDDEN };
    }
    return result;
  }
}
