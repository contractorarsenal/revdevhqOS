import { describe, expect, it } from "vitest";
import { clientLeadIngestSchema, clientLeadManualEntrySchema } from "@/lib/validation";
import { formatInTimezone } from "@/lib/date-tz";
import {
  CA_CLIENT_LEAD_CLIENTS,
  INGEST_CLIENT_LEAD_ERROR,
  TRADER_U_CLIENT_ID,
  classifyCaClientLeadScope,
  ingestClientLeadParseError,
} from "@/lib/client-lead-ingest";

const HIGHLINE = "891cd47a-17ad-447d-982b-7d0bb1052b66";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    clientId: HIGHLINE,
    name: "Jane Homeowner",
    source: "Website",
    receivedOn: "2026-09-22",
    externalMessageId: "gmail-msg-1",
    dedupeKey: "gmail:msg-1",
    ingestionSource: "gmail",
    ...overrides,
  };
}

describe("clientLeadIngestSchema", () => {
  it("accepts a complete automated payload", () => {
    const parsed = clientLeadIngestSchema.safeParse(payload());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.externalMessageId).toBe("gmail-msg-1");
    expect(parsed.data.dedupeKey).toBe("gmail:msg-1");
    expect(parsed.data.receivedOn).toBe("2026-09-22");
    expect(parsed.data.ingestionSource).toBe("gmail");
  });

  it("rejects a missing or blank externalMessageId or dedupeKey", () => {
    for (const overrides of [
      { externalMessageId: undefined },
      { dedupeKey: undefined },
      { externalMessageId: "  " },
      { dedupeKey: "" },
      { ingestionSource: undefined },
    ]) {
      const parsed = clientLeadIngestSchema.safeParse(payload(overrides));
      expect(parsed.success).toBe(false);
      if (parsed.success) continue;
      expect(ingestClientLeadParseError(parsed.error).code).toBe(INGEST_CLIENT_LEAD_ERROR.MISSING_FIELDS);
    }
  });

  it("rejects ingestionSource manual — that channel is the human form", () => {
    const parsed = clientLeadIngestSchema.safeParse(payload({ ingestionSource: "manual" }));
    expect(parsed.success).toBe(false);
  });

  it("rejects a receivedOn that is not YYYY-MM-DD", () => {
    const parsed = clientLeadIngestSchema.safeParse(payload({ receivedOn: "09/22/2026" }));
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(ingestClientLeadParseError(parsed.error).code).toBe(INGEST_CLIENT_LEAD_ERROR.INVALID_DATE);
  });

  it("does not treat UTC midnight of that calendar day as the Pacific day", () => {
    // The bug automated ingest must not reintroduce: new Date("YYYY-MM-DD")
    // is UTC midnight, which is still the previous calendar day in Pacific.
    expect(formatInTimezone(new Date("2026-09-22"), "America/Los_Angeles").date).toBe("2026-09-21");
    const parsed = clientLeadIngestSchema.parse(payload({ receivedOn: "2026-09-22" }));
    expect(parsed.receivedOn).toBe("2026-09-22");
  });
});

describe("manual entry stays key-optional", () => {
  it("still accepts a human payload with no externalMessageId or dedupeKey", () => {
    const parsed = clientLeadManualEntrySchema.safeParse({
      clientId: HIGHLINE,
      name: "Jane Homeowner",
      source: "Manual",
      receivedOn: "2026-09-22",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("classifyCaClientLeadScope", () => {
  it("allows each Contractor Arsenal client id", () => {
    for (const client of CA_CLIENT_LEAD_CLIENTS) {
      expect(classifyCaClientLeadScope({ id: client.id, industry: "Roofing" })).toEqual({ ok: true });
    }
  });

  it("rejects Trader U even when the industry looks like a contractor trade", () => {
    const result = classifyCaClientLeadScope({ id: TRADER_U_CLIENT_ID, industry: "Roofing" });
    expect(result).toMatchObject({ ok: false, code: INGEST_CLIENT_LEAD_ERROR.NOT_CA_CLIENT });
  });

  it("rejects a Crypto Community industry that is not on the allowlist", () => {
    const result = classifyCaClientLeadScope({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      industry: "Crypto Community",
    });
    expect(result).toMatchObject({ ok: false, code: INGEST_CLIENT_LEAD_ERROR.NOT_CA_CLIENT });
  });

  it("rejects an allowlisted id whose industry is Crypto Community", () => {
    const result = classifyCaClientLeadScope({ id: HIGHLINE, industry: "  CRYPTO   COMMUNITY " });
    expect(result).toMatchObject({ ok: false, code: INGEST_CLIENT_LEAD_ERROR.NOT_CA_CLIENT });
  });

  it("returns UNMAPPED for any other client, including a contractor-looking industry", () => {
    const result = classifyCaClientLeadScope({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      industry: "Roofing",
    });
    expect(result).toMatchObject({ ok: false, code: INGEST_CLIENT_LEAD_ERROR.UNMAPPED });
  });
});
