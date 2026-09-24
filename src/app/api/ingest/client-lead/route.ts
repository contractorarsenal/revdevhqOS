import { NextResponse } from "next/server";
import { clientLeadIngestSecret } from "@/lib/env/server";
import {
  INGEST_CLIENT_LEAD_ERROR,
  authorizationMatchesIngestSecret,
  ingestFailureStatus,
} from "@/lib/client-lead-ingest";
import { executeClientLeadIngest } from "@/server/services/client-lead-ingest";

/**
 * Inbox & Leads HTTP ingest. Same body and codes as `ingestClientLead`.
 *
 * ```
 * POST /api/ingest/client-lead
 * Authorization: Bearer <CLIENT_LEAD_INGEST_SECRET>
 * ```
 *
 * The secret is read per request. If it is unset in the environment, every
 * call is 401 — the route is not public. The client's workspace is taken
 * from the client row after the secret check. See src/lib/client-lead-ingest.ts.
 */
export async function POST(request: Request) {
  if (!authorizationMatchesIngestSecret(request.headers.get("authorization"), clientLeadIngestSecret())) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", code: INGEST_CLIENT_LEAD_ERROR.UNAUTHORIZED },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be JSON.", code: INGEST_CLIENT_LEAD_ERROR.MISSING_FIELDS },
      { status: 400 },
    );
  }

  const result = await executeClientLeadIngest({ input: body, actorId: null });
  if (result.ok) {
    return NextResponse.json({ ok: true, data: result.data }, { status: 200 });
  }
  return NextResponse.json(
    { ok: false, error: result.error, code: result.code },
    { status: ingestFailureStatus(result.code) },
  );
}
