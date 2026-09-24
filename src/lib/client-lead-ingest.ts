/**
 * Automated Client Lead ingest for Inbox & Leads.
 *
 * Call `ingestClientLead` in `src/server/actions/client-lead-ingest.ts`
 * (workspace admin session — `authorize("admin")`). Do not drive automation
 * through `createManualClientLead` or the browser form: that path leaves
 * `externalMessageId` / `dedupeKey` optional, so a row can be inserted with
 * null keys and a later update cannot make dedupe atomic.
 *
 * Required on every call, and written on the initial INSERT:
 *   clientId, name, source, receivedOn (YYYY-MM-DD),
 *   externalMessageId, dedupeKey, ingestionSource
 * Optional: email, phone, requestedService
 *
 * `receivedOn` is a calendar date. Never parse it with `new Date("YYYY-MM-DD")`
 * (that is UTC midnight and the previous day in America/Los_Angeles).
 *
 * Success: `{ ok: true, data: { id, duplicate } }`.
 *   First call → `duplicate: false`. Same externalMessageId or dedupeKey
 *   again → the existing id, `duplicate: true`, no second row.
 * Failure: `{ ok: false, error, code }` where `code` is one of
 *   MISSING_FIELDS, INVALID_DATE, INVALID_CLIENT, NOT_CA_CLIENT, UNMAPPED, FORBIDDEN.
 *
 * CA scope (automated ingest only). Client industry is free text, so it is
 * not an allow signal — a non-CA business can be mistagged, and CA trades
 * are not a closed enum. Fail closed:
 *   - Trader U's id is always NOT_CA_CLIENT (Crypto Community; not a CA client),
 *     even if the allowlist is later edited to include that id.
 *   - A known non-CA industry (Crypto Community) is NOT_CA_CLIENT.
 *   - Only the allowlisted Contractor Arsenal client ids may be ingested.
 *   - Any other workspace client is UNMAPPED until its id is added here.
 * Manual `createManualClientLead` still lets a human log a lead for any
 * workspace client. That form is not the Inbox path.
 */

import type { ZodError } from "zod";

export const INGEST_CLIENT_LEAD_ERROR = {
  MISSING_FIELDS: "MISSING_FIELDS",
  INVALID_DATE: "INVALID_DATE",
  INVALID_CLIENT: "INVALID_CLIENT",
  NOT_CA_CLIENT: "NOT_CA_CLIENT",
  UNMAPPED: "UNMAPPED",
  FORBIDDEN: "FORBIDDEN",
} as const;

export type IngestClientLeadErrorCode =
  (typeof INGEST_CLIENT_LEAD_ERROR)[keyof typeof INGEST_CLIENT_LEAD_ERROR];

/** Live Trader U client. Not a Contractor Arsenal home-service client. */
export const TRADER_U_CLIENT_ID = "db92ded1-837d-4e69-843c-2f73f1588e09";

/**
 * Contractor Arsenal clients eligible for automated Client Lead ingest.
 * Ids are the live `clients.id` values. Add a new CA client here when they
 * are onboarded; until then ingest returns UNMAPPED and inserts nothing.
 */
export const CA_CLIENT_LEAD_CLIENTS = [
  { id: "48f52c80-0166-4175-a51c-2bcd830aad81", name: "Agave Welding" },
  { id: "08a2c4c5-0abd-4cb6-8350-deb6d49d5e70", name: "DGO Green" },
  { id: "64aba590-8476-4547-a2fd-23682ddc8fc7", name: "Elite Bathrooms" },
  { id: "9678ac62-8d7c-42f9-ad44-33012a3874cd", name: "Golden Oak" },
  { id: "891cd47a-17ad-447d-982b-7d0bb1052b66", name: "Highline Roofing" },
  { id: "f8c09c43-d24d-48a6-a278-6ce91e21ca14", name: "JBA Roofing" },
  { id: "894560bf-4913-41e1-af90-09e1eb1fd281", name: "JC Grading" },
  { id: "227b11d2-6034-4d13-9641-1603e0acf3e2", name: "Young Bucks" },
] as const;

const CA_CLIENT_LEAD_IDS = new Set<string>(CA_CLIENT_LEAD_CLIENTS.map((client) => client.id));

/** Exact industry labels that are never Contractor Arsenal home services. */
const NON_CA_INDUSTRIES = new Set(["crypto community", "crypto"]);

export type CaClientLeadScope =
  | { ok: true }
  | { ok: false; code: typeof INGEST_CLIENT_LEAD_ERROR.NOT_CA_CLIENT | typeof INGEST_CLIENT_LEAD_ERROR.UNMAPPED; error: string };

function normalizeIndustry(industry: string | null | undefined): string {
  return (industry ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function classifyCaClientLeadScope(client: {
  id: string;
  industry?: string | null;
}): CaClientLeadScope {
  const industry = normalizeIndustry(client.industry);
  if (client.id === TRADER_U_CLIENT_ID || NON_CA_INDUSTRIES.has(industry)) {
    return {
      ok: false,
      code: INGEST_CLIENT_LEAD_ERROR.NOT_CA_CLIENT,
      error: "That client is not a Contractor Arsenal client and cannot receive Client Leads.",
    };
  }
  if (!CA_CLIENT_LEAD_IDS.has(client.id)) {
    return {
      ok: false,
      code: INGEST_CLIENT_LEAD_ERROR.UNMAPPED,
      error: "That client is not mapped for automated Client Lead ingest.",
    };
  }
  return { ok: true };
}

export function ingestClientLeadParseError(error: ZodError): {
  ok: false;
  error: string;
  code: typeof INGEST_CLIENT_LEAD_ERROR.MISSING_FIELDS | typeof INGEST_CLIENT_LEAD_ERROR.INVALID_DATE;
} {
  const issue = error.issues[0];
  const field = issue?.path[0];
  const message = issue?.message ?? "Missing required ingest fields.";
  if (field === "receivedOn") {
    return { ok: false, error: message, code: INGEST_CLIENT_LEAD_ERROR.INVALID_DATE };
  }
  return { ok: false, error: message, code: INGEST_CLIENT_LEAD_ERROR.MISSING_FIELDS };
}
