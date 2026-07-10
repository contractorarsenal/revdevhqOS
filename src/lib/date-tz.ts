/**
 * Workspace-timezone date/time helpers. One source of truth for converting
 * between a workspace's local wall-clock (what a person types and reads)
 * and UTC instants (what gets stored in `timestamptz` columns).
 *
 * The core primitive is `zonedTimeToUtc`: it computes the IANA zone's UTC
 * offset for the SPECIFIC date in question (not "now"), so it stays correct
 * across DST transitions. `formatInTimezone` is its exact inverse for
 * display. Every calendar create/update/render goes through exactly one of
 * these — never both, never neither — so the offset is applied exactly
 * once in each direction.
 */

/** "YYYY-MM-DD" for right now, in the given IANA timezone. */
export function todayInTimezone(timezone: string, at: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(at); // en-CA formats as YYYY-MM-DD
}

/**
 * Converts a wall-clock date + time as experienced in `timezone` into the
 * true UTC instant it represents. E.g. ("2026-07-10", "15:00", "America/Los_Angeles")
 * -> the UTC instant that reads as 3:00 PM in Los Angeles that day (which is
 * 22:00 UTC in July, PDT/UTC-7 — correctly distinct from the 23:00 UTC it
 * would be in January under PST/UTC-8).
 *
 * Algorithm: treat the wall-clock components as if they were already UTC to
 * get a reference instant, ask what that instant reads as in `timezone`,
 * and use the difference to correct the reference instant. This computes
 * the real offset for that specific date, so it is correct across DST
 * boundaries (unlike diffing against "now").
 */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timezone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const asUtcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(asUtcGuess)).map((p) => [p.type, p.value]));
  const readAsIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  const offsetMs = readAsIfUtc - asUtcGuess;
  return new Date(asUtcGuess - offsetMs);
}

/** The exact inverse of zonedTimeToUtc: reads a UTC instant as wall-clock date/time in `timezone`. */
export function formatInTimezone(instant: Date, timezone: string): { date: string; time: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Start-of-day and start-of-next-day as UTC instants, for range queries. */
export function dayBoundsInTimezone(timezone: string, dateStr: string): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextStr = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  return {
    start: zonedTimeToUtc(dateStr, "00:00", timezone),
    end: zonedTimeToUtc(nextStr, "00:00", timezone),
  };
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

/** Formats a 24h "HH:MM" string as a readable 12h label, e.g. "15:00" -> "3:00 PM". */
export function formatTimeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Formats a "YYYY-MM-DD" string as a full readable date, e.g. "2026-08-15" -> "August 15, 2026". */
export function formatFullDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
