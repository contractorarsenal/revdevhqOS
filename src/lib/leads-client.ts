/**
 * Pure client-facing lead model: the 5-value status workflow shown in the
 * client portal, lead sources, and the "Needs Response" rule. No database,
 * no clock ambient reads — callers supply "now" explicitly, mirroring
 * lib/goals.ts's convention.
 *
 * These 5 statuses are a strict subset of the (workspace-wide) lead_status
 * enum, reserved exclusively for leads generated FOR a client
 * (leads.client_id set). Agency-prospect leads (client_id null) continue
 * using "qualified" / "unqualified" / "converted", which a client-generated
 * lead must never be set to.
 */
export const CLIENT_LEAD_STATUSES = ["new", "contacted", "estimate_scheduled", "won", "lost"] as const;
export type ClientLeadStatus = (typeof CLIENT_LEAD_STATUSES)[number];

export function isClientLeadStatus(status: string): status is ClientLeadStatus {
  return (CLIENT_LEAD_STATUSES as readonly string[]).includes(status);
}

export const CLIENT_LEAD_STATUS_LABEL: Record<ClientLeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  estimate_scheduled: "Estimate Scheduled",
  won: "Won",
  lost: "Lost",
};

/** Board/status-badge color per status — text always accompanies color. */
export const CLIENT_LEAD_STATUS_STYLE: Record<ClientLeadStatus, { text: string; badge: string; dot: string }> = {
  new: { text: "text-indigo-700 dark:text-indigo-400", badge: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400", dot: "bg-indigo-500" },
  contacted: { text: "text-amber-700 dark:text-amber-400", badge: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400", dot: "bg-amber-500" },
  estimate_scheduled: { text: "text-sky-700 dark:text-sky-400", badge: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-400", dot: "bg-sky-500" },
  won: { text: "text-emerald-700 dark:text-emerald-400", badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400", dot: "bg-emerald-500" },
  lost: { text: "text-slate-500 dark:text-slate-400", badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400", dot: "bg-slate-400" },
};

export const LEAD_SOURCES = [
  "Website", "Google Business Profile", "Google Ads", "Facebook", "Referral", "Phone", "Manual", "Other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/**
 * A lead "needs response" when it has never been contacted — status is
 * still "new" AND contactedAt is unset. Deliberately status-based, not
 * time-based: age only controls the visual emphasis (see isOverdue24h), it
 * never auto-changes status.
 */
export function isNeedsResponse(lead: { status: string; contactedAt: Date | string | null }): boolean {
  return lead.status === "new" && !lead.contactedAt;
}

/** True once a needs-response lead has been waiting more than 24 hours —
 * visual emphasis only, never mutates status. */
export function isOverdue24h(receivedAt: Date | string, now: Date): boolean {
  const received = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
  return now.getTime() - received.getTime() > 24 * 60 * 60 * 1000;
}

/* ========== quick-action hrefs ========== */

/** `tel:` href with display-only formatting (spaces, parens, dashes) stripped
 * so the dialer receives clean digits — a leading "+" (country code) is kept.
 * Returns null when there is nothing dialable, so callers omit the action
 * entirely rather than rendering a dead `tel:` link. */
export function telHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

/** `sms:` href, same cleaning as telHref. Null when there's no number. */
export function smsHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^\d+]/g, "");
  return digits ? `sms:${digits}` : null;
}

/** `mailto:` href, or null when there's no address. */
export function mailtoHref(email: string | null | undefined): string | null {
  const clean = (email ?? "").trim();
  return clean ? `mailto:${clean}` : null;
}

/* ========== status transition stamping ========== */

/** The single `*_at` timestamp a status transition records, so the portal
 * action and any future internal path can never diverge on which column a
 * status sets. "new" stamps nothing (it is the pre-contact state); the stamp
 * is additive — moving to "won" never clears an earlier contactedAt. */
export function clientLeadStatusTimestamp(
  status: ClientLeadStatus,
  now: Date
): Partial<Record<"lastContactedAt" | "estimateScheduledAt" | "wonAt" | "lostAt", Date>> {
  switch (status) {
    case "contacted": return { lastContactedAt: now };
    case "estimate_scheduled": return { estimateScheduledAt: now };
    case "won": return { wonAt: now };
    case "lost": return { lostAt: now };
    default: return {};
  }
}

/** Maps a client-facing status onto the legacy 6-value internal editable
 * set, for the one place a staff member might open a client-generated lead
 * in the internal (agency-prospect-oriented) edit form: "estimate_scheduled"
 * reads as "contacted" (an active conversation), "won" as "qualified"
 * (further along than open, since "converted" specifically means "became a
 * Contractor Arsenal client", which a client-generated lead never is). This
 * is presentation-only — it never writes back estimate_scheduled_at/won_at
 * and does not change the stored status. */
export function toInternalEditableStatus(status: string): "new" | "contacted" | "qualified" | "unqualified" | "converted" | "lost" {
  if (status === "estimate_scheduled") return "contacted";
  if (status === "won") return "qualified";
  return status as "new" | "contacted" | "qualified" | "unqualified" | "converted" | "lost";
}
