import { describe, expect, it } from "vitest";
import {
  normalizeToMonthly, calculateMrr, calculateArr, invoiceBalance,
  outstandingRevenue, pastDueRevenue, isPastDue, pipelineValue, weightedPipelineValue, toAmount,
  isRevenuePayment, recalcInvoiceAfterVoid, paymentAttribution,
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

describe("payment voiding", () => {
  it("only succeeded payments count as revenue", () => {
    expect(isRevenuePayment("succeeded")).toBe(true);
    for (const s of ["pending", "failed", "refunded", "voided"]) {
      expect(isRevenuePayment(s)).toBe(false);
    }
  });

  it("voiding the only payment on a paid invoice reopens it with zero paid", () => {
    const r = recalcInvoiceAfterVoid({ total: "1000", amountPaid: "1000", status: "paid" }, "1000");
    expect(r).toEqual({ amountPaid: 0, status: "open" });
  });

  it("voiding a partial payment leaves the invoice partially paid and open", () => {
    const r = recalcInvoiceAfterVoid({ total: "1000", amountPaid: "700", status: "open" }, "300");
    expect(r).toEqual({ amountPaid: 400, status: "open" });
  });

  it("invoice stays paid when remaining payments still cover the total", () => {
    const r = recalcInvoiceAfterVoid({ total: "1000", amountPaid: "1500", status: "paid" }, "500");
    expect(r).toEqual({ amountPaid: 1000, status: "paid" });
  });

  it("never produces a negative paid amount", () => {
    const r = recalcInvoiceAfterVoid({ total: "1000", amountPaid: "200", status: "open" }, "500");
    expect(r.amountPaid).toBe(0);
  });
});

describe("paymentAttribution", () => {
  const invoice = { clientId: "client-A", billingFrequency: "monthly", billingMonth: "2026-07-01" };

  it("uses the invoice's client even when the request names another client", () => {
    const r = paymentAttribution(invoice, { clientId: "client-B", paymentType: "one_time", billingMonth: null });
    expect(r.clientId).toBe("client-A");
  });

  it("copies invoice billing type and month", () => {
    const r = paymentAttribution(invoice, { clientId: null, paymentType: "one_time", billingMonth: "2026-09-01" });
    expect(r.paymentType).toBe("monthly");
    expect(r.billingMonth).toBe("2026-07-01");
  });

  it("falls back to request month when invoice has none", () => {
    const r = paymentAttribution({ ...invoice, billingMonth: null }, { clientId: null, paymentType: "one_time", billingMonth: "2026-09-01" });
    expect(r.billingMonth).toBe("2026-09-01");
  });

  it("without an invoice, request values are used unchanged", () => {
    const r = paymentAttribution(null, { clientId: "client-B", paymentType: "monthly", billingMonth: "2026-08-01" });
    expect(r).toEqual({ clientId: "client-B", paymentType: "monthly", billingMonth: "2026-08-01" });
  });
});
