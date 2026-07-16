import { describe, expect, it } from "vitest";
import {
  normalizeEmail, validateInviteForAcceptance, resolvePostLoginDestination,
  industryAccent, resolveClientAccent, PORTAL_INDUSTRIES,
  hasPortalRole, assertPortalRole,
} from "./portal";
import { SIDEBAR_PRIMARY_NAV } from "@/components/layout/nav-items";

const NOW = new Date("2026-07-14T12:00:00Z");
const FUTURE = new Date("2026-07-20T12:00:00Z");
const PAST = new Date("2026-07-01T12:00:00Z");

function invite(overrides: Partial<Parameters<typeof validateInviteForAcceptance>[0]> = {}) {
  return { email: "owner@highlineroofing.com", expiresAt: FUTURE, acceptedAt: null, revokedAt: null, ...overrides };
}

describe("invite acceptance validation", () => {
  const ctx = { now: NOW, userEmail: "owner@highlineroofing.com" };

  it("accepts a live invite for the matching email", () => {
    expect(validateInviteForAcceptance(invite(), ctx)).toEqual({ ok: true });
  });

  it("rejects a used invite — one-time semantics beat every other state", () => {
    const r = validateInviteForAcceptance(invite({ acceptedAt: PAST, revokedAt: PAST, expiresAt: PAST }), ctx);
    expect(r).toMatchObject({ ok: false, reason: "used" });
  });

  it("rejects a revoked invite", () => {
    expect(validateInviteForAcceptance(invite({ revokedAt: PAST }), ctx)).toMatchObject({ ok: false, reason: "revoked" });
  });

  it("rejects an expired invite", () => {
    expect(validateInviteForAcceptance(invite({ expiresAt: PAST }), ctx)).toMatchObject({ ok: false, reason: "expired" });
  });

  it("rejects an email mismatch, case-insensitively correct", () => {
    expect(
      validateInviteForAcceptance(invite(), { now: NOW, userEmail: "someone-else@gmail.com" })
    ).toMatchObject({ ok: false, reason: "email_mismatch" });
    expect(
      validateInviteForAcceptance(invite({ email: "Owner@HighlineRoofing.com" }), ctx)
    ).toEqual({ ok: true });
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Dana@Highline.COM ")).toBe("dana@highline.com");
  });
});

describe("post-login destination resolver", () => {
  it("internal members always land on the internal dashboard, even with a client membership", () => {
    expect(resolvePostLoginDestination({ hasInternalMembership: true, portalMembershipStatus: "active" })).toBe("/dashboard");
    expect(resolvePostLoginDestination({ hasInternalMembership: true, portalMembershipStatus: null })).toBe("/dashboard");
  });

  it("client-only active members land on /portal", () => {
    expect(resolvePostLoginDestination({ hasInternalMembership: false, portalMembershipStatus: "active" })).toBe("/portal");
  });

  it("suspended and revoked members land on the safe access-denied page", () => {
    expect(resolvePostLoginDestination({ hasInternalMembership: false, portalMembershipStatus: "suspended" })).toBe("/portal/access-denied");
    expect(resolvePostLoginDestination({ hasInternalMembership: false, portalMembershipStatus: "revoked" })).toBe("/portal/access-denied");
  });

  it("users with no memberships fall back to setup", () => {
    expect(resolvePostLoginDestination({ hasInternalMembership: false, portalMembershipStatus: null })).toBe("/setup");
  });
});

describe("portal role hierarchy (lead management permissions)", () => {
  it("client_owner and client_member can both manage leads", () => {
    expect(hasPortalRole("client_owner", "client_member")).toBe(true);
    expect(hasPortalRole("client_member", "client_member")).toBe(true);
    expect(() => assertPortalRole("client_owner", "client_member")).not.toThrow();
    expect(() => assertPortalRole("client_member", "client_member")).not.toThrow();
  });

  it("client_read_only cannot manage leads — every mutation gate rejects it", () => {
    expect(hasPortalRole("client_read_only", "client_member")).toBe(false);
    expect(() => assertPortalRole("client_read_only", "client_member")).toThrow();
  });

  it("client_read_only can still view (meets the read-only floor)", () => {
    expect(hasPortalRole("client_read_only", "client_read_only")).toBe(true);
    expect(() => assertPortalRole("client_read_only", "client_read_only")).not.toThrow();
  });

  it("only the owner clears the owner bar", () => {
    expect(hasPortalRole("client_owner", "client_owner")).toBe(true);
    expect(hasPortalRole("client_member", "client_owner")).toBe(false);
    expect(hasPortalRole("client_read_only", "client_owner")).toBe(false);
  });
});

describe("industry theming", () => {
  it("resolves the documented defaults", () => {
    expect(industryAccent("Landscaping")).toBe("#15803D");
    expect(industryAccent("Painting")).toBe("#DC2626");
    expect(industryAccent("Roofing")).toBe("#334155");
    expect(industryAccent("General Contractor")).toBe("#171717");
    expect(industryAccent("Concrete")).toBe("#6B7280");
    expect(industryAccent("HVAC")).toBe("#2563EB");
    expect(industryAccent("Plumbing")).toBe("#2563EB");
    expect(industryAccent("Electrical")).toBe("#D97706");
    expect(industryAccent("Other")).toBe("#DC2626");
  });

  it("unknown or missing industries fall back to Contractor Arsenal red", () => {
    expect(industryAccent("Cleaning")).toBe("#DC2626");
    expect(industryAccent(null)).toBe("#DC2626");
    expect(industryAccent("Spaceship Repair")).toBe("#DC2626");
  });

  it("a manual accent override always wins over the industry default", () => {
    expect(resolveClientAccent({ portalAccentColor: "#123456", industry: "Landscaping" })).toBe("#123456");
    expect(resolveClientAccent({ portalAccentColor: null, industry: "Landscaping" })).toBe("#15803D");
    expect(resolveClientAccent({ portalAccentColor: "not-a-color", industry: "Landscaping" })).toBe("#15803D");
  });

  it("offers the ten specified industries", () => {
    expect(PORTAL_INDUSTRIES).toHaveLength(10);
    expect(PORTAL_INDUSTRIES).toContain("Roofing");
  });
});

describe("sidebar navigation order", () => {
  it("matches the requested order exactly", () => {
    expect(SIDEBAR_PRIMARY_NAV.map((i) => i.label)).toEqual([
      "Dashboard", "Pipeline", "Leads", "Clients", "Calendar",
      "Billing", "Expenses", "Reports", "Goals", "Tasks", "Projects",
    ]);
  });
});
