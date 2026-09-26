import "server-only";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { actionError, type ActionResult } from "@/server/action-error";
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
 * Shared insert for the admin server action and POST /api/ingest/client-lead.
 * Keys are arguments to the single createClientLead call. There is no
 * post-insert patch of external_message_id or dedupe_key.
 *
 * `workspaceId`, when set, is the caller's session workspace (the client
 * must belong to it). The HTTP route omits it and uses the client's own
 * workspace after the bearer secret has already been checked.
 */
export async function executeClientLeadIngest(args: {
  input: unknown;
  actorId: string | null;
  workspaceId?: string;
}): Promise<ActionResult<{ id: string; duplicate: boolean }>> {
  try {
    const parsed = clientLeadIngestSchema.safeParse(args.input);
    if (!parsed.success) return ingestClientLeadParseError(parsed.error);

    const data = parsed.data;
    try {
      assertDateOnly(data.receivedOn);
    } catch (err) {
      const message = err instanceof Error ? err.message : "receivedOn must be YYYY-MM-DD";
      return { ok: false, error: message, code: INGEST_CLIENT_LEAD_ERROR.INVALID_DATE };
    }

    const where = args.workspaceId
      ? and(eq(clients.id, data.clientId), eq(clients.workspaceId, args.workspaceId))
      : eq(clients.id, data.clientId);
    const [client] = await db
      .select({
        id: clients.id,
        workspaceId: clients.workspaceId,
        status: clients.status,
        archivedAt: clients.archivedAt,
        industry: clients.industry,
      })
      .from(clients)
      .where(where)
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

    const { id, duplicate } = await createClientLead({
      workspaceId: client.workspaceId,
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
      actorId: args.actorId,
    });

    revalidatePath(`/clients/${data.clientId}`);
    revalidatePath(`/clients/${data.clientId}/leads`);
    revalidatePath("/clientportal/dashboard");
    revalidatePath("/clientportal/leads");
    return { ok: true, data: { id, duplicate } };
  } catch (err) {
    return actionError(err);
  }
}
