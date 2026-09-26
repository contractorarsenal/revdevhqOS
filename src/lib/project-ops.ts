/**
 * Pure project-operations rules shared by the dashboard (and safe for
 * client components): waiting-on classification, "needs attention" rules,
 * and stage grouping. Deliberately rule-based and explainable — no scoring.
 */
import type { WaitingOnParty } from "@/lib/validation";

export const WAITING_ON_LABEL: Record<WaitingOnParty, string> = {
  client: "Client",
  ca: "Contractor Arsenal",
  jay: "Jay",
  third_party: "Third party",
  other: "Other",
};

/** Explicit party wins; otherwise a waiting_on_client stage means Client;
 * otherwise light keyword classification of the free text. Null when there
 * is genuinely nothing being waited on. */
export function classifyWaitingOn(input: {
  status: string;
  waitingOn: string | null;
  waitingOnParty: string | null;
}): WaitingOnParty | null {
  if (input.waitingOnParty && input.waitingOnParty in WAITING_ON_LABEL) return input.waitingOnParty as WaitingOnParty;
  const text = (input.waitingOn ?? "").toLowerCase().trim();
  if (input.status === "waiting_on_client") return "client";
  if (!text) return null;
  if (/\b(client|customer|homeowner|owner approval)\b/.test(text)) return "client";
  if (/\bjay\b/.test(text)) return "jay";
  if (/\b(ca|contractor arsenal|internal|team|design|dev|us)\b/.test(text)) return "ca";
  if (/\b(vendor|third|godaddy|google|meta|facebook|registrar|hosting|dns|supplier)\b/.test(text)) return "third_party";
  return "other";
}

export const STAGE_ORDER = [
  "onboarding", "waiting_on_client", "ready_to_build", "building", "client_review",
  "revisions", "ready_to_launch", "live", "paused", "at_risk",
] as const;

export type AttentionInput = {
  id: string;
  name: string;
  status: string;
  dueDate: string | null; // yyyy-mm-dd
  waitingOn: string | null;
  updatedAt: Date;
  overdueTaskCount: number;
};

export const WAITING_TOO_LONG_DAYS = 7;
export const LAUNCH_APPROACHING_DAYS = 7;

/** Real, explainable rules — every reason names the rule that fired. */
export function attentionReasons(p: AttentionInput, todayYmd: string, now: Date): string[] {
  const reasons: string[] = [];
  if (p.status === "closed" || p.status === "live") return reasons;
  if (p.status === "at_risk") reasons.push("Marked At Risk");
  if (p.overdueTaskCount > 0) reasons.push(`${p.overdueTaskCount} overdue task${p.overdueTaskCount === 1 ? "" : "s"}`);
  if (p.dueDate) {
    const days = Math.round((Date.parse(`${p.dueDate}T12:00:00Z`) - Date.parse(`${todayYmd}T12:00:00Z`)) / 86_400_000);
    if (days < 0) reasons.push(`Target date passed ${Math.abs(days)}d ago`);
    else if (days <= LAUNCH_APPROACHING_DAYS) reasons.push(days === 0 ? "Due today" : `Due in ${days}d`);
  }
  if (p.waitingOn) {
    const idleDays = Math.floor((now.getTime() - p.updatedAt.getTime()) / 86_400_000);
    if (idleDays >= WAITING_TOO_LONG_DAYS) reasons.push(`Waiting ${idleDays}d with no update`);
  }
  return reasons;
}
