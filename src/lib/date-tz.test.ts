import { describe, expect, it } from "vitest";
import { todayInTimezone, dayBoundsInTimezone, toDateOnlyString, toLocalDateInput } from "./date-tz";

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

describe("dayBoundsInTimezone", () => {
  it("produces a 24-hour range", () => {
    const { start, end } = dayBoundsInTimezone("America/Los_Angeles", "2026-07-09");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
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
