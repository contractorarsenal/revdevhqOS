import { describe, expect, it } from "vitest";
import {
  normalizeToMonthly, calculateMrr, calculateArr, invoiceBalance,
  outstandingRevenue, pastDueRevenue, isPastDue, pipelineValue, weightedPipelineValue, toAmount,
  isRevenuePayment, recalcInvoiceAfterVoid, recalcInvoiceForPaymentChange, paymentAttribution,
  currentDueMonth, isDueLate, nextPaymentFor,
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

describe("recalcInvoiceForPaymentChange — general delta recalculation for edit/void/restore/delete", () => {
  const invoice = { total: "1000", amountPaid: "500", status: "open" };

  it("create: before=null applies the full new amount", () => {
    const r = recalcInvoiceForPaymentChange(invoice, null, { status: "succeeded", amount: 200 });
    expect(r).toEqual({ amountPaid: 700, status: "open" });
  });

  it("edit: raising a succeeded payment's amount applies only the delta", () => {
    const r = recalcInvoiceForPaymentChange(invoice, { status: "succeeded", amount: 300 }, { status: "succeeded", amount: 500 });
    expect(r).toEqual({ amountPaid: 700, status: "open" }); // 500 - 300 + 500
  });

  it("edit: lowering a succeeded payment's amount un-applies the delta and can reopen a paid invoice", () => {
    const paid = { total: "1000", amountPaid: "1000", status: "paid" };
    const r = recalcInvoiceForPaymentChange(paid, { status: "succeeded", amount: 400 }, { status: "succeeded", amount: 100 });
    expect(r).toEqual({ amountPaid: 700, status: "open" });
  });

  it("edit: flipping status away from succeeded un-applies the full amount, same as a void", () => {
    const r = recalcInvoiceForPaymentChange(invoice, { status: "succeeded", amount: 300 }, { status: "pending", amount: 300 });
    expect(r).toEqual({ amountPaid: 200, status: "open" });
  });

  it("restore: flipping status from voided back to succeeded re-applies the amount", () => {
    const r = recalcInvoiceForPaymentChange(invoice, { status: "voided", amount: 300 }, { status: "succeeded", amount: 300 });
    expect(r).toEqual({ amountPaid: 800, status: "open" });
  });

  it("restore: a payment that was pending before being voided restores to no revenue contribution", () => {
    const r = recalcInvoiceForPaymentChange(invoice, { status: "voided", amount: 300 }, { status: "pending", amount: 300 });
    expect(r).toEqual({ amountPaid: 500, status: "open" }); // unchanged — pending never contributed
  });

  it("delete: after=null un-applies the full amount, identical to a void", () => {
    const r = recalcInvoiceForPaymentChange(invoice, { status: "succeeded", amount: 500 }, null);
    expect(r).toEqual({ amountPaid: 0, status: "open" });
  });

  it("delete of a non-revenue payment (pending/failed) never touches amountPaid", () => {
    const r = recalcInvoiceForPaymentChange(invoice, { status: "pending", amount: 500 }, null);
    expect(r).toEqual({ amountPaid: 500, status: "open" });
  });

  it("editing a payment that isn't succeeded before or after is a no-op", () => {
    const r = recalcInvoiceForPaymentChange(invoice, { status: "failed", amount: 300 }, { status: "refunded", amount: 900 });
    expect(r).toEqual({ amountPaid: 500, status: "open" });
  });

  it("newPaid crossing the total marks the invoice paid", () => {
    const r = recalcInvoiceForPaymentChange(invoice, { status: "succeeded", amount: 500 }, { status: "succeeded", amount: 1000 });
    expect(r).toEqual({ amountPaid: 1000, status: "paid" });
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

describe("recurring subscription due dates", () => {
  const base = { id: "s1", clientId: "c1", amount: "1000", frequency: "monthly" as const, status: "active", paymentDay: 5, startDate: "2026-01-01" };

  it("owes the current month once the payment day has passed", () => {
    expect(currentDueMonth(base, new Date("2026-07-10T00:00:00Z"))).toBe("2026-07-01");
  });

  it("still owes last month before this month's payment day arrives", () => {
    expect(currentDueMonth(base, new Date("2026-07-03T00:00:00Z"))).toBe("2026-06-01");
  });

  it("is not due before the subscription started", () => {
    const sub = { ...base, startDate: "2026-07-01", paymentDay: 20 };
    expect(currentDueMonth(sub, new Date("2026-07-10T00:00:00Z"))).toBeNull();
  });

  it("is not due for paused/canceled subscriptions", () => {
    expect(currentDueMonth({ ...base, status: "paused" }, new Date("2026-07-10T00:00:00Z"))).toBeNull();
  });

  it("is not due for one-time subscriptions", () => {
    expect(currentDueMonth({ ...base, frequency: "one_time" }, new Date("2026-07-10T00:00:00Z"))).toBeNull();
  });

  it("flags late after a 5-day grace period past the due date", () => {
    expect(isDueLate("2026-07-01", new Date("2026-07-04T00:00:00Z"), 5)).toBe(false);
    expect(isDueLate("2026-07-01", new Date("2026-07-11T00:00:00Z"), 5)).toBe(true);
  });
});

describe("nextPaymentFor — the Next Payment display bug", () => {
  const base = { id: "s1", clientId: "c1", amount: "1000", frequency: "monthly" as const, status: "active", paymentDay: 15, startDate: "2026-01-01" };
  const neverCollected = () => false;

  it("shows this month's payment day once it's due and not yet collected", () => {
    const info = nextPaymentFor(base, neverCollected, new Date("2026-07-20T00:00:00Z"));
    expect(info).toEqual({ dueDate: "2026-07-15", late: false, collected: false });
  });

  it("advances to next month once the current cycle has been collected — never re-shows a collected period", () => {
    const collectedJuly = (month: string) => month === "2026-07-01";
    const info = nextPaymentFor(base, collectedJuly, new Date("2026-07-20T00:00:00Z"));
    expect(info).toEqual({ dueDate: "2026-08-15", late: false, collected: true });
  });

  it("flags overdue once past the grace period, without inventing a different date", () => {
    const info = nextPaymentFor(base, neverCollected, new Date("2026-07-25T00:00:00Z"));
    expect(info).toEqual({ dueDate: "2026-07-15", late: true, collected: false });
  });

  it("before the first payment day ever arrives, projects the subscription's own start-month payment day", () => {
    const sub = { ...base, startDate: "2026-07-01" };
    const info = nextPaymentFor(sub, neverCollected, new Date("2026-07-05T00:00:00Z"));
    expect(info).toEqual({ dueDate: "2026-07-15", late: false, collected: false });
  });

  it("clamps a payment day past the end of a short month instead of rolling into the next month", () => {
    // Payment day 31, projected onto February (28 days in 2026): still owes
    // February's cycle (today's date-of-month 5 hasn't reached day 31 yet).
    const sub = { ...base, paymentDay: 31, startDate: "2026-01-01" };
    const info = nextPaymentFor(sub, neverCollected, new Date("2026-03-05T00:00:00Z"));
    expect(info?.dueDate).toBe("2026-02-28");
  });

  it("returns null (empty state) for a paused, canceled, or non-monthly subscription — never invents a date", () => {
    expect(nextPaymentFor({ ...base, status: "paused" }, neverCollected)).toBeNull();
    expect(nextPaymentFor({ ...base, status: "canceled" }, neverCollected)).toBeNull();
    expect(nextPaymentFor({ ...base, frequency: "yearly" }, neverCollected)).toBeNull();
  });
});
