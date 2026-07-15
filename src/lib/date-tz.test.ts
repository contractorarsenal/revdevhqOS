import { describe, expect, it } from "vitest";
import { todayInTimezone, dayBoundsInTimezone, toDateOnlyString, toLocalDateInput, zonedTimeToUtc, formatInTimezone, formatTimeLabel, formatFullDate } from "./date-tz";

describe("todayInTimezone", () => {
  it("returns YYYY-MM-DD for a fixed UTC instant in a west-coast timezone", () => {
    // 2026-07-09T05:00:00Z is still 2026-07-08 22:00 in America/Los_Angeles (PDT, UTC-7)
    expect(todayInTimezone("America/Los_Angeles", new Date("2026-07-09T05:00:00Z"))).toBe("2026-07-08");
  });
  it("returns the next day once past midnight local time", () => {
    expect(todayInTimezone("America/Los_Angeles", new Date("2026-07-09T08:00:00Z"))).toBe("2026-07-09");
  });
  it("UTC timezone matches the UTC calendar date directly", () => {
    expect(todayInTimezone("UTC", new Date("2026-07-09T23:30:00Z"))).toBe("2026-07-09");
  });
});

describe("zonedTimeToUtc / formatInTimezone — the calendar time bug fix", () => {
  it("3:00 PM in America/Los_Angeles during PDT (July) is 22:00 UTC, not 8:00 AM UTC", () => {
    const instant = zonedTimeToUtc("2026-07-10", "15:00", "America/Los_Angeles");
    expect(instant.toISOString()).toBe("2026-07-10T22:00:00.000Z");
  });

  it("round-trips exactly: entering 3:00 PM-4:00 PM and reading it back gives 15:00/16:00", () => {
    const start = zonedTimeToUtc("2026-07-10", "15:00", "America/Los_Angeles");
    const end = zonedTimeToUtc("2026-07-10", "16:00", "America/Los_Angeles");
    expect(formatInTimezone(start, "America/Los_Angeles")).toEqual({ date: "2026-07-10", time: "15:00" });
    expect(formatInTimezone(end, "America/Los_Angeles")).toEqual({ date: "2026-07-10", time: "16:00" });
  });

  it("editing to 5:00 PM-6:00 PM round-trips correctly too (not stuck on the old time)", () => {
    const start = zonedTimeToUtc("2026-07-10", "17:00", "America/Los_Angeles");
    expect(formatInTimezone(start, "America/Los_Angeles").time).toBe("17:00");
  });

  it("is correct across the winter/PST offset (UTC-8) as well as summer/PDT (UTC-7)", () => {
    const winter = zonedTimeToUtc("2026-01-10", "15:00", "America/Los_Angeles");
    expect(winter.toISOString()).toBe("2026-01-10T23:00:00.000Z"); // PST is UTC-8
    expect(formatInTimezone(winter, "America/Los_Angeles")).toEqual({ date: "2026-01-10", time: "15:00" });
  });

  it("never silently shifts the calendar date (no UTC day rollover for evening times)", () => {
    // 11 PM Pacific is still the same evening, even though it's already the next UTC day
    const lateNight = zonedTimeToUtc("2026-07-10", "23:30", "America/Los_Angeles");
    expect(formatInTimezone(lateNight, "America/Los_Angeles").date).toBe("2026-07-10");
  });

  it("a distinct timezone (UTC) round-trips identically, proving offset is applied exactly once", () => {
    const instant = zonedTimeToUtc("2026-07-10", "15:00", "UTC");
    expect(instant.toISOString()).toBe("2026-07-10T15:00:00.000Z");
    expect(formatInTimezone(instant, "UTC")).toEqual({ date: "2026-07-10", time: "15:00" });
  });
});

describe("dayBoundsInTimezone", () => {
  it("produces a 24-hour range", () => {
    const { start, end } = dayBoundsInTimezone("America/Los_Angeles", "2026-07-09");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
  it("start is midnight Pacific, correctly offset from UTC", () => {
    const { start } = dayBoundsInTimezone("America/Los_Angeles", "2026-07-10");
    expect(start.toISOString()).toBe("2026-07-10T07:00:00.000Z"); // midnight PDT = 07:00 UTC
  });

  it("spring-forward day (America/Los_Angeles, 2026-03-08) is 23 hours, not 24", () => {
    const { start, end } = dayBoundsInTimezone("America/Los_Angeles", "2026-03-08");
    expect(start.toISOString()).toBe("2026-03-08T08:00:00.000Z"); // midnight PST = UTC-8
    expect(end.toISOString()).toBe("2026-03-09T07:00:00.000Z"); // next midnight is already PDT = UTC-7
    expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("fall-back day (America/Los_Angeles, 2026-11-01) is 25 hours, not 24", () => {
    const { start, end } = dayBoundsInTimezone("America/Los_Angeles", "2026-11-01");
    expect(start.toISOString()).toBe("2026-11-01T07:00:00.000Z"); // midnight PDT = UTC-7
    expect(end.toISOString()).toBe("2026-11-02T08:00:00.000Z"); // next midnight is already PST = UTC-8
    expect(end.getTime() - start.getTime()).toBe(25 * 60 * 60 * 1000);
  });
});

describe("todayInTimezone — across a DST transition", () => {
  it("stays on the spring-forward date on both sides of the 2 AM -> 3 AM jump", () => {
    // 1:59 AM PST, one minute before the jump
    expect(todayInTimezone("America/Los_Angeles", new Date("2026-03-08T09:59:00Z"))).toBe("2026-03-08");
    // 3:01 AM PDT, one minute after — clocks skip 2:00-2:59 AM entirely, but the calendar date doesn't jump
    expect(todayInTimezone("America/Los_Angeles", new Date("2026-03-08T10:01:00Z"))).toBe("2026-03-08");
  });

  it("stays on the fall-back date across the repeated 1 AM hour", () => {
    // 1:30 AM PDT (first pass, before falling back)
    expect(todayInTimezone("America/Los_Angeles", new Date("2026-11-01T08:30:00Z"))).toBe("2026-11-01");
    // 1:30 AM PST (second pass, same wall-clock time repeated after falling back)
    expect(todayInTimezone("America/Los_Angeles", new Date("2026-11-01T09:30:00Z"))).toBe("2026-11-01");
  });
});

describe("toDateOnlyString", () => {
  it("passes through a plain date string unchanged", () => {
    expect(toDateOnlyString("2026-07-10")).toBe("2026-07-10");
  });
  it("normalizes a Date object (as returned by some drivers) to YYYY-MM-DD", () => {
    expect(toDateOnlyString(new Date("2026-07-10T00:00:00.000Z"))).toBe("2026-07-10");
  });
  it("returns null for null/undefined", () => {
    expect(toDateOnlyString(null)).toBeNull();
    expect(toDateOnlyString(undefined)).toBeNull();
  });
});

describe("toLocalDateInput", () => {
  it("formats using local wall-clock components, not UTC", () => {
    const d = new Date(2026, 6, 9); // July 9, local time — month is 0-indexed
    expect(toLocalDateInput(d)).toBe("2026-07-09");
  });
});

describe("formatTimeLabel", () => {
  it("formats 15:00 as 3:00 PM", () => {
    expect(formatTimeLabel("15:00")).toBe("3:00 PM");
  });
  it("formats 00:00 as 12:00 AM and 12:00 as 12:00 PM", () => {
    expect(formatTimeLabel("00:00")).toBe("12:00 AM");
    expect(formatTimeLabel("12:00")).toBe("12:00 PM");
  });
});

describe("formatFullDate", () => {
  it("formats a date string as a full readable date", () => {
    expect(formatFullDate("2026-08-15")).toBe("August 15, 2026");
  });
});
