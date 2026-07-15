import { describe, expect, it } from "vitest";
import { monthPeriodByOffset, monthOverMonth, profitMargin } from "./reports";

describe("monthPeriodByOffset", () => {
  it("offset 0 is the current month", () => {
    expect(monthPeriodByOffset("2026-07-15", 0)).toEqual({ start: "2026-07-01", end: "2026-07-31" });
  });

  it("offset -1 is the previous month", () => {
    expect(monthPeriodByOffset("2026-07-15", -1)).toEqual({ start: "2026-06-01", end: "2026-06-30" });
  });

  it("crosses a year boundary backwards", () => {
    expect(monthPeriodByOffset("2026-01-15", -1)).toEqual({ start: "2025-12-01", end: "2025-12-31" });
    expect(monthPeriodByOffset("2026-07-15", -7)).toEqual({ start: "2025-12-01", end: "2025-12-31" });
  });

  it("crosses a year boundary forwards", () => {
    expect(monthPeriodByOffset("2026-07-15", 6)).toEqual({ start: "2027-01-01", end: "2027-01-31" });
  });

  it("handles a large historical offset (multi-year)", () => {
    expect(monthPeriodByOffset("2026-07-15", -24)).toEqual({ start: "2024-07-01", end: "2024-07-31" });
  });
});

describe("monthOverMonth", () => {
  it("increase: positive absolute and percent change", () => {
    const r = monthOverMonth(5427.15, 4583.02);
    expect(r.absoluteChange).toBeCloseTo(844.13, 2);
    expect(r.percentChange).toBeCloseTo(18.42, 1);
  });

  it("decrease: negative absolute and percent change", () => {
    const r = monthOverMonth(1850, 1972.5);
    expect(r.absoluteChange).toBeCloseTo(-122.5, 2);
    expect(r.percentChange).toBeCloseTo(-6.21, 1);
  });

  it("previous month zero with current > 0: percentChange is null, never Infinity", () => {
    const r = monthOverMonth(500, 0);
    expect(r.absoluteChange).toBe(500);
    expect(r.percentChange).toBeNull();
    expect(Number.isFinite(r.percentChange)).toBe(false); // null, not a finite number either — explicitly not Infinity
  });

  it("both zero: no change, percentChange is null (nothing to compare)", () => {
    const r = monthOverMonth(0, 0);
    expect(r.absoluteChange).toBe(0);
    expect(r.percentChange).toBeNull();
  });

  it("integer count metrics (new clients): +1 reads as a whole number", () => {
    const r = monthOverMonth(4, 3);
    expect(r.absoluteChange).toBe(1);
    expect(r.percentChange).toBeCloseTo(33.33, 1);
  });
});

describe("profitMargin", () => {
  it("computes margin as a percentage of revenue", () => {
    expect(profitMargin(5427.15, 3577.15)).toBeCloseTo(65.91, 1);
  });

  it("zero revenue: null, never NaN or Infinity", () => {
    const m = profitMargin(0, 0);
    expect(m).toBeNull();
    const negative = profitMargin(0, -500); // pure loss, no revenue
    expect(negative).toBeNull();
  });

  it("a loss (negative profit) produces a negative margin, not an error", () => {
    expect(profitMargin(1000, -200)).toBeCloseTo(-20, 1);
  });
});
