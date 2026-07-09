import { describe, expect, it } from "vitest";
import {
  normalizeToMonthly, calculateMrr, calculateArr, invoiceBalance,
  outstandingRevenue, pastDueRevenue, isPastDue, pipelineValue, weightedPipelineValue, toAmount,
} from "./metrics";

describe("normalizeToMonthly", () => {
  it("normalizes weekly to (amount * 52) / 12", () => {
    expect(normalizeToMonthly(120, "weekly")).toBeCloseTo(520, 5);
  });
  it("keeps monthly as-is", () => {
    expect(normalizeToMonthly(1400, "monthly")).toBe(1400);
  });
  it("divides quarterly by 3", () => {
    expect(normalizeToMonthly(3000, "quarterly")).toBe(1000);
  });
  it("divides yearly by 12", () => {
    expect(normalizeToMonthly(12000, "yearly")).toBe(1000);
  });
  it("one-time contributes zero MRR", () => {
    expect(normalizeToMonthly(50000, "one_time")).toBe(0);
  });
});

describe("calculateMrr / calculateArr", () => {
  const subs = [
    { amount: "1400", frequency: "monthly", status: "active" },
    { amount: "3000", frequency: "quarterly", status: "active" },
    { amount: "12000", frequency: "yearly", status: "past_due" },
    { amount: "800", frequency: "monthly", status: "paused" },
    { amount: "9000", frequency: "one_time", status: "active" },
    { amount: "500", frequency: "monthly", status: "canceled" },
  ] as const;

  it("sums active + past_due, normalized; ignores paused/canceled/one-time", () => {
    expect(calculateMrr([...subs])).toBe(1400 + 1000 + 1000);
  });
  it("ARR is MRR × 12", () => {
    expect(calculateArr(3400)).toBe(40800);
  });
  it("returns 0 for an empty workspace", () => {
    expect(calculateMrr([])).toBe(0);
  });
});

describe("invoices", () => {
  const today = new Date("2026-07-08T12:00:00Z");
  const invoices = [
    { status: "open", total: "1000", amountPaid: "250", dueDate: "2026-07-20" },
    { status: "open", total: "2400", amountPaid: "0", dueDate: "2026-06-26" },
    { status: "past_due", total: "2800", amountPaid: "950", dueDate: "2026-07-03" },
    { status: "paid", total: "5000", amountPaid: "5000", dueDate: "2026-06-01" },
    { status: "draft", total: "999", amountPaid: "0", dueDate: "2026-06-01" },
    { status: "void", total: "700", amountPaid: "0", dueDate: "2026-06-01" },
  ];

  it("invoiceBalance is total minus paid, floored at zero", () => {
    expect(invoiceBalance({ total: "1000", amountPaid: "250" })).toBe(750);
    expect(invoiceBalance({ total: "100", amountPaid: "150" })).toBe(0);
  });
  it("outstanding sums unpaid balances on open/past_due only", () => {
    expect(outstandingRevenue(invoices)).toBe(750 + 2400 + 1850);
  });
  it("past-due sums only invoices past their due date", () => {
    expect(pastDueRevenue(invoices, today)).toBe(2400 + 1850);
  });
  it("draft and void invoices are never past due", () => {
    expect(isPastDue(invoices[4], today)).toBe(false);
    expect(isPastDue(invoices[5], today)).toBe(false);
  });
});

describe("pipeline", () => {
  const opps = [
    { status: "open", value: "12000", probability: 65 },
    { status: "open", value: "8000", probability: 25 },
    { status: "won", value: "99999", probability: 100 },
    { status: "lost", value: "5000", probability: 0 },
  ];
  it("pipeline value sums open deals only", () => {
    expect(pipelineValue(opps)).toBe(20000);
  });
  it("weighted pipeline applies stage probability", () => {
    expect(weightedPipelineValue(opps)).toBe(12000 * 0.65 + 8000 * 0.25);
  });
});

describe("toAmount", () => {
  it("parses numeric strings and rejects garbage", () => {
    expect(toAmount("1234.56")).toBe(1234.56);
    expect(toAmount(null)).toBe(0);
    expect(toAmount("not-a-number")).toBe(0);
  });
});
