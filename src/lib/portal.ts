/**
 * Pure client-portal domain logic: roles, invite validation, industry
 * theming, and the single authoritative post-login destination resolver.
 * No database, no crypto, no server imports — fully unit-testable and safe
 * to import from client components.
 */

export type ClientPortalRole = "client_owner" | "client_member" | "client_read_only";
export type ClientPortalStatus = "invited" | "active" | "suspended" | "revoked";

export const PORTAL_ROLE_LABEL: Record<ClientPortalRole, string> = {
  client_owner: "Owner",
  client_member: "Member",
  client_read_only: "Read-only",
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/* ========== invite acceptance validation ========== */

export type InviteForValidation = {
  email: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
};

export type InviteRejection = "used" | "revoked" | "expired" | "email_mismatch";

/**
 * The one place that decides whether an invite may be accepted. Order
 * matters: a revoked invite reports "revoked" even if also expired, and a
 * used invite always reports "used" (one-time semantics).
 */
export function validateInviteForAcceptance(
  invite: InviteForValidation,
  ctx: { now: Date; userEmail: string }
): { ok: true } | { ok: false; reason: InviteRejection; message: string } {
  if (invite.acceptedAt) {
    return { ok: false, reason: "used", message: "This invitation has already been used." };
  }
  if (invite.revokedAt) {
    return { ok: false, reason: "revoked", message: "This invitation has been revoked. Ask your agency contact for a new one." };
  }
  if (ctx.now > invite.expiresAt) {
    return { ok: false, reason: "expired", message: "This invitation has expired. Ask your agency contact for a new one." };
  }
  if (normalizeEmail(ctx.userEmail) !== normalizeEmail(invite.email)) {
    return { ok: false, reason: "email_mismatch", message: "This invitation was issued for a different email address. Sign in with the invited email." };
  }
  return { ok: true };
}

/* ========== post-login destination ========== */

/**
 * One authoritative resolver for where a signed-in user lands.
 * Internal membership always wins — internal users who also hold a client
 * membership still default to the internal dashboard.
 */
export function resolvePostLoginDestination(input: {
  hasInternalMembership: boolean;
  portalMembershipStatus: ClientPortalStatus | null;
}): "/dashboard" | "/portal" | "/portal/access-denied" | "/setup" {
  if (input.hasInternalMembership) return "/dashboard";
  if (input.portalMembershipStatus === "active") return "/portal";
  if (input.portalMembershipStatus === "suspended" || input.portalMembershipStatus === "revoked") {
    return "/portal/access-denied";
  }
  return "/setup";
}

/* ========== industry theming ========== */

export const PORTAL_INDUSTRIES = [
  "Painting", "Landscaping", "Roofing", "General Contractor", "Concrete",
  "Cleaning", "HVAC", "Plumbing", "Electrical", "Other",
] as const;

const CONTRACTOR_ARSENAL_RED = "#DC2626";

/** Restrained accent defaults per industry; anything unknown (including
 * "Cleaning", which has no specified default) falls back to Contractor
 * Arsenal red. Owners can always override manually. */
const INDUSTRY_ACCENT: Record<string, string> = {
  landscaping: "#15803D",
  painting: "#DC2626",
  roofing: "#334155",
  "general contractor": "#171717",
  concrete: "#6B7280",
  hvac: "#2563EB",
  plumbing: "#2563EB",
  electrical: "#D97706",
  other: CONTRACTOR_ARSENAL_RED,
};

export function industryAccent(industry: string | null | undefined): string {
  if (!industry) return CONTRACTOR_ARSENAL_RED;
  return INDUSTRY_ACCENT[industry.trim().toLowerCase()] ?? CONTRACTOR_ARSENAL_RED;
}

/** Manual override wins; otherwise the industry default; otherwise CA red. */
export function resolveClientAccent(client: { portalAccentColor?: string | null; industry?: string | null }): string {
  if (client.portalAccentColor && /^#[0-9a-fA-F]{6}$/.test(client.portalAccentColor)) {
    return client.portalAccentColor;
  }
  return industryAccent(client.industry);
}
