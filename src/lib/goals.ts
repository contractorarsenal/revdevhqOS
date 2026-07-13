/**
 * Pure goal-period and pace-calculation logic. No database, no clock, no
 * timezone reads — every function takes plain workspace-local calendar date
 * strings ("YYYY-MM-DD"). The caller supplies "today" via
 * todayInTimezone(workspace.timezone), which is the ONLY place the
 * workspace timezone enters these calculations, so all period math is
 * immune to the server's own timezone.
 *
 * Conventions (also encoded in the tests):
 * - Period bounds are INCLUSIVE: start and end are both inside the period.
 * - The current day counts as elapsed: on day 15 of a 30-day month the
 *   elapsed fraction is 15/30 = 50%.
 * - remainingDays counts the days AFTER today (July 13 of a 31-day month →
 *   18 remaining), matching "18 days left, $144.44/day required".
 * - Required pace divides by max(1, remainingDays): on the period's final
 *   day the full remaining amount is "today's" required pace.
 * - A projection needs at least 2 elapsed days; before that it is null and
 *   the UI shows "Not enough data yet" instead of a misleading number.
 */

export type GoalMetricType =
  | "revenue_collected" | "new_clients" | "new_leads" | "calls_completed"
  | "emails_sent" | "projects_completed" | "tasks_completed" | "custom";
export type GoalPeriodType = "weekly" | "monthly" | "quarterly" | "annual" | "custom";
export type PeriodState = "upcoming" | "active" | "ended";
export type GoalPaceStatus = "achieved" | "on_track" | "at_risk" | "behind" | "neutral";

export const MANUAL_METRICS: readonly GoalMetricType[] = ["calls_completed", "emails_sent", "custom"];

export function isManualMetric(metric: GoalMetricType): boolean {
  return MANUAL_METRICS.includes(metric);
}

export function isMoneyMetric(metric: GoalMetricType): boolean {
  return metric === "revenue_collected";
}

export const METRIC_LABEL: Record<GoalMetricType, string> = {
  revenue_collected: "Revenue collected",
  new_clients: "New clients",
  new_leads: "New leads",
  calls_completed: "Calls completed",
  emails_sent: "Emails sent",
  projects_completed: "Projects completed",
  tasks_completed: "Tasks completed",
  custom: "Custom",
};

/* ========== date-string math (UTC-anchored, timezone-free) ========== */

function toUtc(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function addDaysStr(dateStr: string, days: number): string {
  return fromUtc(toUtc(dateStr) + days * 86400000);
}

/** Whole days from a to b (positive when b is after a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

export function isValidDateStr(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/* ========== period resolution ========== */

export type Period = { start: string; end: string };

/** Monday-through-Sunday week containing the given date. */
export function weekPeriodContaining(dateStr: string): Period {
  const dow = new Date(toUtc(dateStr)).getUTCDay(); // 0=Sun..6=Sat
  const sinceMonday = (dow + 6) % 7;
  const start = addDaysStr(dateStr, -sinceMonday);
  return { start, end: addDaysStr(start, 6) };
}

export function monthPeriod(year: number, month1: number): Period {
  const start = `${year}-${String(month1).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  return { start, end: `${year}-${String(month1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}` };
}

/** Q1: Jan–Mar, Q2: Apr–Jun, Q3: Jul–Sep, Q4: Oct–Dec. */
export function quarterPeriod(year: number, quarter: 1 | 2 | 3 | 4): Period {
  const startMonth = (quarter - 1) * 3 + 1;
  return { start: monthPeriod(year, startMonth).start, end: monthPeriod(year, startMonth + 2).end };
}

export function annualPeriod(year: number): Period {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export type PeriodInput = {
  periodType: GoalPeriodType;
  /** any date inside the target week (weekly) */
  weekDate?: string;
  /** "YYYY-MM" (monthly) */
  month?: string;
  quarter?: number;
  year?: number;
  customStart?: string;
  customEnd?: string;
};

/** Resolves a form's period selection into inclusive start/end dates.
 * Throws with a user-readable message on invalid input. */
export function resolvePeriod(input: PeriodInput): Period {
  switch (input.periodType) {
    case "weekly": {
      if (!input.weekDate || !isValidDateStr(input.weekDate)) throw new Error("Pick a date inside the target week.");
      return weekPeriodContaining(input.weekDate);
    }
    case "monthly": {
      if (!input.month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error("Pick a target month.");
      const [y, m] = input.month.split("-").map(Number);
      return monthPeriod(y, m);
    }
    case "quarterly": {
      const q = input.quarter;
      const y = input.year;
      if (!y || y < 2000 || y > 2100 || !q || ![1, 2, 3, 4].includes(q)) throw new Error("Pick a quarter and year.");
      return quarterPeriod(y, q as 1 | 2 | 3 | 4);
    }
    case "annual": {
      const y = input.year;
      if (!y || y < 2000 || y > 2100) throw new Error("Pick a target year.");
      return annualPeriod(y);
    }
    case "custom": {
      if (!input.customStart || !isValidDateStr(input.customStart)) throw new Error("Custom period needs a start date.");
      if (!input.customEnd || !isValidDateStr(input.customEnd)) throw new Error("Custom period needs an end date.");
      if (input.customEnd < input.customStart) throw new Error("Custom end date must be on or after the start date.");
      return { start: input.customStart, end: input.customEnd };
    }
  }
}

/** The immediately-following period of the same shape, for "Duplicate for
 * next period". Custom periods repeat their own length starting the day
 * after they end. */
export function nextPeriod(periodType: GoalPeriodType, period: Period): Period {
  const dayAfter = addDaysStr(period.end, 1);
  switch (periodType) {
    case "weekly":
      return weekPeriodContaining(dayAfter);
    case "monthly": {
      const [y, m] = dayAfter.split("-").map(Number);
      return monthPeriod(y, m);
    }
    case "quarterly": {
      const [y, m] = dayAfter.split("-").map(Number);
      return quarterPeriod(y, (Math.floor((m - 1) / 3) + 1) as 1 | 2 | 3 | 4);
    }
    case "annual":
      return annualPeriod(Number(dayAfter.slice(0, 4)));
    case "custom": {
      const length = daysBetween(period.start, period.end);
      return { start: dayAfter, end: addDaysStr(dayAfter, length) };
    }
  }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function shortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
}

/** Human label for a goal's period: "July 2026", "Week of Jul 13, 2026",
 * "Q3 2026", "2026", or "Jul 1, 2026 – Aug 15, 2026". */
export function periodLabel(periodType: GoalPeriodType, period: Period): string {
  const [y, m] = period.start.split("-").map(Number);
  switch (periodType) {
    case "weekly":
      return `Week of ${shortDate(period.start)}`;
    case "monthly":
      return `${MONTHS[m - 1]} ${y}`;
    case "quarterly":
      return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
    case "annual":
      return String(y);
    case "custom":
      return `${shortDate(period.start)} – ${shortDate(period.end)}`;
  }
}

/* ========== goal computation ========== */

export type GoalComputation = {
  current: number;
  target: number;
  /** real percentage — may exceed 100 */
  progressPct: number;
  remainingValue: number;
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  /** target × elapsed fraction */
  expectedValue: number;
  expectedPct: number;
  /** current ÷ elapsed days; null before the period starts */
  currentPace: number | null;
  /** remaining ÷ remaining days; 0 once achieved; null when ended/upcoming */
  requiredPace: number | null;
  /** current pace × total days; null with <2 elapsed days or when not active */
  projectedValue: number | null;
  periodState: PeriodState;
  status: GoalPaceStatus;
};

export type GoalComputationInput = {
  current: number;
  target: number;
  periodStart: string;
  periodEnd: string;
  /** todayInTimezone(workspace.timezone) */
  today: string;
};

/**
 * Status thresholds (ratio = actual progress ÷ expected progress by today):
 *   achieved  — current ≥ target, regardless of pace
 *   on_track  — ratio ≥ 0.95
 *   at_risk   — 0.75 ≤ ratio < 0.95
 *   behind    — ratio < 0.75
 *   neutral   — upcoming period, invalid target, or fewer than 2 elapsed
 *               days (so a monthly goal is never red on day one)
 * Ended periods resolve to achieved or behind — pace no longer applies.
 */
export function computeGoal(input: GoalComputationInput): GoalComputation {
  const { current, target, periodStart, periodEnd, today } = input;

  const totalDays = daysBetween(periodStart, periodEnd) + 1;
  const periodState: PeriodState =
    today < periodStart ? "upcoming" : today > periodEnd ? "ended" : "active";

  const rawElapsed = periodState === "upcoming" ? 0 : periodState === "ended" ? totalDays : daysBetween(periodStart, today) + 1;
  const elapsedDays = Math.min(Math.max(rawElapsed, 0), totalDays);
  const remainingDays = totalDays - elapsedDays;

  const validTarget = Number.isFinite(target) && target > 0;
  const progressPct = validTarget ? (current / target) * 100 : 0;
  const remainingValue = Math.max(0, target - current);
  const elapsedFraction = totalDays > 0 ? elapsedDays / totalDays : 0;
  const expectedValue = validTarget ? target * elapsedFraction : 0;
  const expectedPct = elapsedFraction * 100;

  const currentPace = periodState === "upcoming" || elapsedDays < 1 ? null : current / elapsedDays;

  const achieved = validTarget && current >= target;
  let requiredPace: number | null = null;
  if (periodState === "active" && validTarget) {
    requiredPace = achieved ? 0 : remainingValue / Math.max(1, remainingDays);
  }

  const projectedValue =
    periodState === "active" && currentPace !== null && elapsedDays >= 2
      ? currentPace * totalDays
      : null;

  let status: GoalPaceStatus;
  if (!validTarget) status = "neutral";
  else if (achieved) status = "achieved";
  else if (periodState === "upcoming") status = "neutral";
  else if (periodState === "ended") status = "behind";
  else if (elapsedDays < 2) status = "neutral";
  else {
    const ratio = expectedValue > 0 ? current / expectedValue : 0;
    status = ratio >= 0.95 ? "on_track" : ratio >= 0.75 ? "at_risk" : "behind";
  }

  return {
    current, target, progressPct, remainingValue, totalDays, elapsedDays, remainingDays,
    expectedValue, expectedPct, currentPace, requiredPace, projectedValue, periodState, status,
  };
}

/** Final presentation status for history views: a goal that ended at 100%+
 * shows "achieved"; ended below target shows "behind"; archived-before-end
 * goals keep whatever state they ended in. */
export const STATUS_LABEL: Record<GoalPaceStatus, string> = {
  achieved: "Achieved",
  on_track: "On track",
  at_risk: "At risk",
  behind: "Behind",
  neutral: "Neutral",
};
