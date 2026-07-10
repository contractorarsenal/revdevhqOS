/**
 * Workspace-timezone date helpers. Shared by the calendar's "today" default
 * and the dashboard's Today/My Day views — one source of truth so they
 * never disagree about what day it is for a given workspace.
 */

/** "YYYY-MM-DD" for right now, in the given IANA timezone. */
export function todayInTimezone(timezone: string, at: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(at); // en-CA formats as YYYY-MM-DD
}

/** Start-of-day and start-of-next-day as UTC instants, for range queries. */
export function dayBoundsInTimezone(timezone: string, dateStr: string): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const now = new Date();
  const offsetMs = now.getTime() - new Date(now.toLocaleString("en-US", { timeZone: timezone })).getTime();
  const start = new Date(new Date(y, m - 1, d, 0, 0, 0).getTime() + offsetMs);
  const end = new Date(new Date(y, m - 1, d + 1, 0, 0, 0).getTime() + offsetMs);
  return { start, end };
}

/**
 * Normalizes a Postgres `date` column value to "YYYY-MM-DD" regardless of
 * driver: node-postgres returns a plain string, but some drivers (e.g. the
 * embedded PGlite dev database) return a Date object instead. Comparing
 * dates as strings only works if both sides go through this first.
 */
export function toDateOnlyString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.length > 10 ? value.slice(0, 10) : value;
}

/** Formats a Date using its *local* wall-clock components (never toISOString, which is UTC). */
export function toLocalDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
