import { describe, expect, it } from "vitest";
import {
  weekPeriodContaining, monthPeriod, quarterPeriod, annualPeriod, resolvePeriod,
  nextPeriod, periodLabel, computeGoal, addDaysStr, daysBetween, isManualMetric,
} from "./goals";
import { todayInTimezone } from "./date-tz";

describe("period boundaries", () => {
  it("monthly period covers the full workspace-local month (America/Los_Angeles)", () => {
    // 2026-08-01T02:00 UTC is still July 31 in Los Angeles — the month must
    // not roll over early because of UTC slicing.
    const laToday = todayInTimezone("America/Los_Angeles", new Date("2026-08-01T02:00:00Z"));
    expect(laToday).toBe("2026-07-31");
    const july = monthPeriod(2026, 7);
    expect(july).toEqual({ start: "2026-07-01", end: "2026-07-31" });
    expect(laToday >= july.start && laToday <= july.end).toBe(true);
  });

  it("February month period handles leap and non-leap years", () => {
    expect(monthPeriod(2026, 2).end).toBe("2026-02-28");
    expect(monthPeriod(2028, 2).end).toBe("2028-02-29");
  });

  it("weekly period starts Monday and ends Sunday", () => {
    // 2026-07-15 is a Wednesday
    expect(weekPeriodContaining("2026-07-15")).toEqual({ start: "2026-07-13", end: "2026-07-19" });
    // Monday maps to itself
    expect(weekPeriodContaining("2026-07-13").start).toBe("2026-07-13");
    // Sunday belongs to the week that STARTED the previous Monday
    expect(weekPeriodContaining("2026-07-19")).toEqual({ start: "2026-07-13", end: "2026-07-19" });
  });

  it("quarterly periods follow the calendar quarters", () => {
    expect(quarterPeriod(2026, 1)).toEqual({ start: "2026-01-01", end: "2026-03-31" });
    expect(quarterPeriod(2026, 2)).toEqual({ start: "2026-04-01", end: "2026-06-30" });
    expect(quarterPeriod(2026, 3)).toEqual({ start: "2026-07-01", end: "2026-09-30" });
    expect(quarterPeriod(2026, 4)).toEqual({ start: "2026-10-01", end: "2026-12-31" });
  });

  it("annual period is Jan 1 through Dec 31", () => {
    expect(annualPeriod(2026)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });

  it("custom period validation rejects end before start and invalid dates", () => {
    expect(() => resolvePeriod({ periodType: "custom", customStart: "2026-07-10", customEnd: "2026-07-01" })).toThrow(/on or after/);
    expect(() => resolvePeriod({ periodType: "custom", customStart: "2026-02-30", customEnd: "2026-03-05" })).toThrow(/start date/);
    expect(resolvePeriod({ periodType: "custom", customStart: "2026-07-01", customEnd: "2026-07-01" })).toEqual({ start: "2026-07-01", end: "2026-07-01" });
  });

  it("resolvePeriod validates each period type's anchor", () => {
    expect(resolvePeriod({ periodType: "monthly", month: "2026-07" })).toEqual({ start: "2026-07-01", end: "2026-07-31" });
    expect(() => resolvePeriod({ periodType: "monthly", month: "2026-13" })).toThrow();
    expect(resolvePeriod({ periodType: "weekly", weekDate: "2026-07-15" }).start).toBe("2026-07-13");
    expect(() => resolvePeriod({ periodType: "quarterly", quarter: 5, year: 2026 })).toThrow();
    expect(resolvePeriod({ periodType: "annual", year: 2026 })).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });

  it("nextPeriod produces the immediately-following period of the same shape", () => {
    expect(nextPeriod("monthly", monthPeriod(2026, 12))).toEqual({ start: "2027-01-01", end: "2027-01-31" });
    expect(nextPeriod("weekly", { start: "2026-07-13", end: "2026-07-19" })).toEqual({ start: "2026-07-20", end: "2026-07-26" });
    expect(nextPeriod("quarterly", quarterPeriod(2026, 4))).toEqual({ start: "2027-01-01", end: "2027-03-31" });
    expect(nextPeriod("annual", annualPeriod(2026))).toEqual({ start: "2027-01-01", end: "2027-12-31" });
    expect(nextPeriod("custom", { start: "2026-07-01", end: "2026-07-10" })).toEqual({ start: "2026-07-11", end: "2026-07-20" });
  });

  it("periodLabel renders human-readable period names", () => {
    expect(periodLabel("monthly", monthPeriod(2026, 7))).toBe("July 2026");
    expect(periodLabel("weekly", { start: "2026-07-13", end: "2026-07-19" })).toBe("Week of Jul 13, 2026");
    expect(periodLabel("quarterly", quarterPeriod(2026, 3))).toBe("Q3 2026");
    expect(periodLabel("annual", annualPeriod(2026))).toBe("2026");
    expect(periodLabel("custom", { start: "2026-07-01", end: "2026-08-15" })).toBe("Jul 1, 2026 – Aug 15, 2026");
  });

  it("date helpers: addDaysStr crosses months and daysBetween is inclusive-exclusive", () => {
    expect(addDaysStr("2026-07-31", 1)).toBe("2026-08-01");
    expect(daysBetween("2026-07-01", "2026-07-31")).toBe(30);
  });
});

describe("computeGoal — the user's worked example", () => {
  // July 13 of a 31-day month: $7,400 of $10,000
  const base = { current: 7400, target: 10000, periodStart: "2026-07-01", periodEnd: "2026-07-31", today: "2026-07-13" };

  it("matches the spec example: 74%, $2,600 remaining, 18 days, $144.44/day", () => {
    const c = computeGoal(base);
    expect(c.progressPct).toBeCloseTo(74, 5);
    expect(c.remainingValue).toBe(2600);
    expect(c.totalDays).toBe(31);
    expect(c.elapsedDays).toBe(13);
    expect(c.remainingDays).toBe(18);
    expect(c.requiredPace).toBeCloseTo(2600 / 18, 2); // $144.44
    expect(c.periodState).toBe("active");
  });

  it("projects the finish from current average pace", () => {
    const c = computeGoal(base);
    // 7400 / 13 days × 31 days ≈ $17,646 — ahead of pace
    expect(c.currentPace).toBeCloseTo(7400 / 13, 5);
    expect(c.projectedValue).toBeCloseTo((7400 / 13) * 31, 5);
    expect(c.status).toBe("on_track");
  });

  it("day 15 of a 30-day month expects exactly 50% (current day counts as elapsed)", () => {
    const c = computeGoal({ current: 0, target: 100, periodStart: "2026-06-01", periodEnd: "2026-06-30", today: "2026-06-15" });
    expect(c.expectedPct).toBeCloseTo(50, 5);
    expect(c.expectedValue).toBeCloseTo(50, 5);
  });
});

describe("computeGoal — progress values", () => {
  const period = { periodStart: "2026-07-01", periodEnd: "2026-07-31" };

  it("progress percentage is current / target × 100", () => {
    expect(computeGoal({ current: 2500, target: 10000, ...period, today: "2026-07-10" }).progressPct).toBe(25);
  });

  it("over-target shows the real percentage above 100", () => {
    const c = computeGoal({ current: 12000, target: 10000, ...period, today: "2026-07-20" });
    expect(c.progressPct).toBeCloseTo(120, 5);
    expect(c.status).toBe("achieved");
    expect(c.remainingValue).toBe(0);
  });

  it("remaining value never goes negative", () => {
    expect(computeGoal({ current: 12000, target: 10000, ...period, today: "2026-07-20" }).remainingValue).toBe(0);
  });

  it("required pace is 0 once the target is reached", () => {
    expect(computeGoal({ current: 10000, target: 10000, ...period, today: "2026-07-10" }).requiredPace).toBe(0);
  });

  it("required pace avoids division by zero on the period's final day", () => {
    const c = computeGoal({ current: 5000, target: 10000, ...period, today: "2026-07-31" });
    expect(c.remainingDays).toBe(0);
    expect(c.requiredPace).toBe(5000); // full remaining amount today
  });

  it("no required pace after the period has ended", () => {
    const c = computeGoal({ current: 5000, target: 10000, ...period, today: "2026-08-05" });
    expect(c.requiredPace).toBeNull();
    expect(c.periodState).toBe("ended");
  });
});

describe("computeGoal — projection availability", () => {
  const period = { periodStart: "2026-07-01", periodEnd: "2026-07-31" };

  it("no projection on day one (not enough data)", () => {
    const c = computeGoal({ current: 500, target: 10000, ...period, today: "2026-07-01" });
    expect(c.elapsedDays).toBe(1);
    expect(c.projectedValue).toBeNull();
  });

  it("projection appears from day two", () => {
    const c = computeGoal({ current: 1000, target: 10000, ...period, today: "2026-07-02" });
    expect(c.projectedValue).toBeCloseTo(500 * 31, 5);
  });

  it("no projection for upcoming or ended periods", () => {
    expect(computeGoal({ current: 0, target: 100, ...period, today: "2026-06-20" }).projectedValue).toBeNull();
    expect(computeGoal({ current: 50, target: 100, ...period, today: "2026-08-02" }).projectedValue).toBeNull();
  });
});

describe("computeGoal — status thresholds", () => {
  // Day 10 of a 30-day period, target 3000 → expected value 1000.
  const base = { target: 3000, periodStart: "2026-06-01", periodEnd: "2026-06-30", today: "2026-06-10" };

  it("achieved when current >= target, even mid-period", () => {
    expect(computeGoal({ ...base, current: 3000 }).status).toBe("achieved");
    expect(computeGoal({ ...base, current: 3500 }).status).toBe("achieved");
  });

  it("on_track at exactly 95% of expected progress (boundary)", () => {
    expect(computeGoal({ ...base, current: 950 }).status).toBe("on_track");
    expect(computeGoal({ ...base, current: 1000 }).status).toBe("on_track");
  });

  it("at_risk just below 95% and at exactly 75% (boundaries)", () => {
    expect(computeGoal({ ...base, current: 949 }).status).toBe("at_risk");
    expect(computeGoal({ ...base, current: 750 }).status).toBe("at_risk");
  });

  it("behind below 75% of expected progress", () => {
    expect(computeGoal({ ...base, current: 749 }).status).toBe("behind");
    expect(computeGoal({ ...base, current: 0 }).status).toBe("behind");
  });

  it("neutral on day one — a monthly goal is never red the morning it starts", () => {
    const c = computeGoal({ current: 0, target: 10000, periodStart: "2026-07-01", periodEnd: "2026-07-31", today: "2026-07-01" });
    expect(c.status).toBe("neutral");
  });

  it("neutral for an upcoming period, with zero elapsed days", () => {
    const c = computeGoal({ current: 0, target: 100, periodStart: "2026-08-01", periodEnd: "2026-08-31", today: "2026-07-20" });
    expect(c.status).toBe("neutral");
    expect(c.periodState).toBe("upcoming");
    expect(c.elapsedDays).toBe(0);
    expect(c.currentPace).toBeNull();
  });

  it("neutral for an invalid target", () => {
    expect(computeGoal({ current: 5, target: 0, periodStart: "2026-07-01", periodEnd: "2026-07-31", today: "2026-07-10" }).status).toBe("neutral");
  });

  it("ended period resolves to achieved or behind — pace no longer applies", () => {
    const period = { periodStart: "2026-06-01", periodEnd: "2026-06-30", today: "2026-07-05" };
    expect(computeGoal({ current: 3000, target: 3000, ...period }).status).toBe("achieved");
    expect(computeGoal({ current: 2999, target: 3000, ...period }).status).toBe("behind");
    expect(computeGoal({ current: 2999, target: 3000, ...period }).expectedPct).toBe(100);
  });

  it("single-day custom period: day one is also the last day, achieved wins over neutral", () => {
    const c = computeGoal({ current: 10, target: 10, periodStart: "2026-07-15", periodEnd: "2026-07-15", today: "2026-07-15" });
    expect(c.status).toBe("achieved");
    expect(c.totalDays).toBe(1);
  });
});

describe("manual metrics", () => {
  it("classifies calls, emails, and custom as manual", () => {
    expect(isManualMetric("calls_completed")).toBe(true);
    expect(isManualMetric("emails_sent")).toBe(true);
    expect(isManualMetric("custom")).toBe(true);
    expect(isManualMetric("revenue_collected")).toBe(false);
    expect(isManualMetric("tasks_completed")).toBe(false);
  });

  it("manual value may exceed the target — over-achievement is legitimate", () => {
    const c = computeGoal({ current: 320, target: 300, periodStart: "2026-07-13", periodEnd: "2026-07-19", today: "2026-07-18" });
    expect(c.progressPct).toBeGreaterThan(100);
    expect(c.status).toBe("achieved");
  });
});
