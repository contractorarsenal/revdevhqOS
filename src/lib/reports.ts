/**
 * Pure math for Monthly Reports: which calendar month a selector offset
 * resolves to, and how to compare two numbers month-over-month without ever
 * producing Infinity/NaN. No database, no clock — mirrors lib/goals.ts's
 * convention: callers supply "today" via todayInTimezone(workspace.timezone).
 */
import { monthPeriod, type Period } from "./goals";

/** Resolves an offset from the workspace-local current month into a
 * calendar period: 0 = this month, -1 = last month, -12 = a year ago, etc. */
export function monthPeriodByOffset(today: string, offsetMonths: number): Period {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  let m = month + offsetMonths;
  let y = year;
  // JS % is not floor-mod for negatives, so normalize by hand.
  m -= 1; // 0-11
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  m += 1; // 1-12
  return monthPeriod(y, m);
}

export type ChangeStats = {
  current: number;
  previous: number;
  absoluteChange: number;
  /** null when previous is 0 — an undefined/"infinite" percentage, never
   * rendered as a number. The UI shows "New" (current > 0) or "—" (both 0). */
  percentChange: number | null;
};

/** Safe month-over-month comparison. */
export function monthOverMonth(current: number, previous: number): ChangeStats {
  const absoluteChange = Math.round((current - previous) * 100) / 100;
  const percentChange = previous === 0 ? null : Math.round(((current - previous) / previous) * 10000) / 100;
  return { current, previous, absoluteChange, percentChange };
}

/** Profit margin as a percentage of revenue; null (never NaN/Infinity) when
 * revenue is zero — there is no honest margin to report against no revenue. */
export function profitMargin(revenue: number, profit: number): number | null {
  if (revenue === 0) return null;
  return Math.round((profit / revenue) * 10000) / 100;
}
