import { describe, expect, it } from "vitest";
import {
  CLIENT_LEAD_STATUSES, CLIENT_LEAD_STATUS_LABEL, LEAD_SOURCES,
  isClientLeadStatus, isNeedsResponse, isOverdue24h,
  telHref, smsHref, mailtoHref, clientLeadStatusTimestamp, toInternalEditableStatus,
} from "./leads-client";

describe("client-facing lead status model", () => {
  it("is exactly the 5-value client workflow — never the agency-prospect statuses", () => {
    expect(CLIENT_LEAD_STATUSES).toEqual(["new", "contacted", "estimate_scheduled", "won", "lost"]);
    // Agency-prospect-only statuses must never leak into the client set.
    for (const s of ["qualified", "unqualified", "converted"]) {
      expect(isClientLeadStatus(s)).toBe(false);
    }
    for (const s of CLIENT_LEAD_STATUSES) expect(isClientLeadStatus(s)).toBe(true);
  });

  it("labels every status with human-readable copy", () => {
    expect(CLIENT_LEAD_STATUS_LABEL.estimate_scheduled).toBe("Estimate Scheduled");
    expect(CLIENT_LEAD_STATUS_LABEL.won).toBe("Won");
    for (const s of CLIENT_LEAD_STATUSES) expect(CLIENT_LEAD_STATUS_LABEL[s]).toBeTruthy();
  });

  it("offers the documented, non-overcomplicated source list", () => {
    expect(LEAD_SOURCES).toContain("Website");
    expect(LEAD_SOURCES).toContain("Google Business Profile");
    expect(LEAD_SOURCES).toContain("Manual");
    expect(LEAD_SOURCES).toContain("Other");
  });
});

describe("Needs Response rule", () => {
  it("is status-based: new AND never contacted", () => {
    expect(isNeedsResponse({ status: "new", contactedAt: null })).toBe(true);
  });

  it("is cleared once contacted, even if still status new", () => {
    expect(isNeedsResponse({ status: "new", contactedAt: new Date() })).toBe(false);
    expect(isNeedsResponse({ status: "new", contactedAt: "2026-07-01T00:00:00Z" })).toBe(false);
  });

  it("never flags a lead that has moved past new", () => {
    expect(isNeedsResponse({ status: "contacted", contactedAt: null })).toBe(false);
    expect(isNeedsResponse({ status: "won", contactedAt: null })).toBe(false);
    expect(isNeedsResponse({ status: "lost", contactedAt: null })).toBe(false);
  });
});

describe("24-hour overdue emphasis (visual only)", () => {
  const now = new Date("2026-07-16T12:00:00Z");
  it("is true past 24h, false within", () => {
    expect(isOverdue24h("2026-07-15T11:59:00Z", now)).toBe(true); // ~24h1m
    expect(isOverdue24h("2026-07-15T12:30:00Z", now)).toBe(false); // 23.5h
    expect(isOverdue24h(new Date("2026-07-14T00:00:00Z"), now)).toBe(true);
  });
});

describe("quick-action hrefs", () => {
  it("tel/sms strip display formatting to clean digits (keeping +)", () => {
    expect(telHref("(555) 123-4567")).toBe("tel:5551234567");
    expect(telHref("+1 555 123 4567")).toBe("tel:+15551234567");
    expect(smsHref("555.123.4567")).toBe("sms:5551234567");
  });

  it("returns null when there is nothing dialable / no address", () => {
    expect(telHref(null)).toBeNull();
    expect(telHref("")).toBeNull();
    expect(smsHref(undefined)).toBeNull();
    expect(mailtoHref(null)).toBeNull();
    expect(mailtoHref("  ")).toBeNull();
  });

  it("mailto trims and prefixes", () => {
    expect(mailtoHref("  dana@example.com ")).toBe("mailto:dana@example.com");
  });
});

describe("status transition stamping", () => {
  const now = new Date("2026-07-16T09:00:00Z");
  it("stamps exactly the matching *_at column for each status", () => {
    expect(clientLeadStatusTimestamp("contacted", now)).toEqual({ lastContactedAt: now });
    expect(clientLeadStatusTimestamp("estimate_scheduled", now)).toEqual({ estimateScheduledAt: now });
    expect(clientLeadStatusTimestamp("won", now)).toEqual({ wonAt: now });
    expect(clientLeadStatusTimestamp("lost", now)).toEqual({ lostAt: now });
  });

  it("stamps nothing for 'new' (the pre-contact state)", () => {
    expect(clientLeadStatusTimestamp("new", now)).toEqual({});
  });
});

describe("internal editable status mapping (never breaks the internal workflow)", () => {
  it("maps the two client-only statuses onto the legacy editable set", () => {
    expect(toInternalEditableStatus("estimate_scheduled")).toBe("contacted");
    expect(toInternalEditableStatus("won")).toBe("qualified");
  });
  it("passes shared statuses through unchanged", () => {
    expect(toInternalEditableStatus("new")).toBe("new");
    expect(toInternalEditableStatus("contacted")).toBe("contacted");
    expect(toInternalEditableStatus("lost")).toBe("lost");
    expect(toInternalEditableStatus("converted")).toBe("converted");
  });
});
