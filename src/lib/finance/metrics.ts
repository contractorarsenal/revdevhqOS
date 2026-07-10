/**
 * Pure financial calculation utilities.
 * All amounts are plain numbers in workspace currency units (dollars).
 * Database `numeric` values arrive as strings — use toAmount() first.
 */
export type BillingFrequency = "one_time" | "weekly" | "monthly" | "quarterly" | "yearly";

export function toAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Normalize a billed amount to its monthly recurring contribution. */
export function normalizeToMonthly(amount: number, frequency: BillingFrequency): number {
  switch (frequency) {
    case "weekly":
      return (amount * 52) / 12;
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "yearly":
      return amount / 12;
    case "one_time":
      return 0;
  }
}

export type SubscriptionLike = {
  amount: string | number;
  frequency: BillingFrequency;
  status: string;
};

/** Statuses that count toward committed recurring revenue. */
export const MRR_STATUSES = new Set(["active", "past_due"]);

export function calculateMrr(subscriptions: SubscriptionLike[]): number {
  const total = subscriptions
    .filter((s) => MRR_STATUSES.has(s.status))
    .reduce((sum, s) => sum + normalizeToMonthly(toAmount(s.amount), s.frequency), 0);
  return roundCents(total);
}

export function calculateArr(mrr: number): number {
  return roundCents(mrr * 12);
}

export type InvoiceLike = {
  status: string;
  total: string | number;
  amountPaid: string | number;
  dueDate: string | Date | null;
};

export function invoiceBalance(invoice: Pick<InvoiceLike, "total" | "amountPaid">): number {
  return roundCents(Math.max(0, toAmount(invoice.total) - toAmount(invoice.amountPaid)));
}

const UNPAID_STATUSES = new Set(["open", "past_due"]);

/** Sum of unpaid balances on issued (non-draft, non-void) invoices. */
export function outstandingRevenue(invoices: InvoiceLike[]): number {
  const total = invoices
    .filter((i) => UNPAID_STATUSES.has(i.status))
    .reduce((sum, i) => sum + invoiceBalance(i), 0);
  return roundCents(total);
}

export function isPastDue(invoice: InvoiceLike, today: Date = new Date()): boolean {
  if (!UNPAID_STATUSES.has(invoice.status)) return false;
  if (invoice.status === "past_due") return true;
  if (!invoice.dueDate) return false;
  const due = typeof invoice.dueDate === "string" ? new Date(invoice.dueDate + "T23:59:59") : invoice.dueDate;
  return due.getTime() < today.getTime();
}

/** Sum of unpaid balances on invoices past their due date. */
export function pastDueRevenue(invoices: InvoiceLike[], today: Date = new Date()): number {
  const total = invoices
    .filter((i) => isPastDue(i, today))
    .reduce((sum, i) => sum + invoiceBalance(i), 0);
  return roundCents(total);
}

export type OpportunityLike = {
  status: string;
  value: string | number;
  probability?: number;
};

export function pipelineValue(opportunities: OpportunityLike[]): number {
  const total = opportunities
    .filter((o) => o.status === "open")
    .reduce((sum, o) => sum + toAmount(o.value), 0);
  return roundCents(total);
}

export function weightedPipelineValue(opportunities: OpportunityLike[]): number {
  const total = opportunities
    .filter((o) => o.status === "open")
    .reduce((sum, o) => sum + toAmount(o.value) * ((o.probability ?? 0) / 100), 0);
  return roundCents(total);
}

export function formatMoney(value: string | number | null | undefined, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: toAmount(value) % 1 === 0 ? 0 : 2,
  }).format(toAmount(value));
}

/** Only succeeded payments count as collected revenue — pending, failed,
 * refunded, and voided payments are excluded from every total and report. */
export function isRevenuePayment(status: string): boolean {
  return status === "succeeded";
}

/**
 * Recalculates an invoice after one of its succeeded payments is voided.
 * Pure: returns the new amountPaid and status without touching the database.
 */
export function recalcInvoiceAfterVoid(invoice: {
  total: string | number;
  amountPaid: string | number;
  status: string;
}, voidedAmount: string | number): { amountPaid: number; status: string } {
  const newPaid = roundCents(Math.max(0, toAmount(invoice.amountPaid) - toAmount(voidedAmount)));
  const paidInFull = newPaid >= toAmount(invoice.total) && toAmount(invoice.total) > 0;
  let status = invoice.status;
  if (invoice.status === "paid" && !paidInFull) status = "open";
  if (paidInFull) status = "paid";
  return { amountPaid: newPaid, status };
}

/**
 * Resolves who a payment belongs to and its billing metadata.
 * When an invoice is attached, the invoice is authoritative: the payment is
 * attributed to the invoice's client (a mismatched request clientId is
 * ignored) and inherits the invoice's billing type and month.
 */
export function paymentAttribution(
  invoice: { clientId: string; billingFrequency: string; billingMonth: string | null } | null,
  input: { clientId?: string | null; paymentType: string; billingMonth?: string | null }
): { clientId: string | null; paymentType: string; billingMonth: string | null } {
  if (invoice) {
    return {
      clientId: invoice.clientId,
      paymentType: invoice.billingFrequency === "monthly" ? "monthly" : "one_time",
      billingMonth: invoice.billingMonth ?? input.billingMonth ?? null,
    };
  }
  return {
    clientId: input.clientId ?? null,
    paymentType: input.paymentType,
    billingMonth: input.billingMonth ?? null,
  };
}

/* ========== recurring subscription collection ========== */

export type SubscriptionDue = {
  id: string;
  clientId: string;
  amount: string | number;
  frequency: BillingFrequency;
  status: string;
  paymentDay: number | null;
  startDate: string;
};

/** First-of-month date string (YYYY-MM-01) for a given Date, in UTC terms. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * The billing month a monthly subscription currently owes for, or null if
 * it isn't due yet (before its payment day in the first month) or isn't a
 * collectible monthly subscription.
 */
export function currentDueMonth(sub: SubscriptionDue, today: Date = new Date()): string | null {
  if (sub.frequency !== "monthly" || sub.status !== "active") return null;
  const day = sub.paymentDay ?? 1;
  const start = new Date(sub.startDate + "T00:00:00Z");
  const startMonth = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
  const thisMonth = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
  // Whichever cycle is currently owed: this month once the payment day has
  // arrived, otherwise still last month's cycle.
  const candidate = today.getUTCDate() >= day ? thisMonth : Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1);
  // Never owe for a cycle before the subscription started.
  if (candidate < startMonth) return null;
  return monthKey(new Date(candidate));
}

export function isDueLate(dueMonth: string, today: Date, paymentDay: number | null): boolean {
  const [y, m] = dueMonth.split("-").map(Number);
  const dueDate = new Date(Date.UTC(y, m - 1, paymentDay ?? 1));
  const graceEnd = new Date(dueDate);
  graceEnd.setUTCDate(graceEnd.getUTCDate() + 5);
  return today > graceEnd;
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** "YYYY-MM-DD" for a payment day within a given month, clamped to that month's length (e.g. day 31 in February). */
function dateOnPaymentDay(year: number, month1: number, day: number): string {
  const clamped = Math.min(day, daysInMonth(year, month1));
  return `${year}-${String(month1).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

export type NextPaymentInfo = { dueDate: string; late: boolean; collected: boolean };

/**
 * The date to show as "Next payment" for an active monthly subscription.
 * Shows the currently-owed cycle's payment day; once that cycle has been
 * collected, advances to the following month's payment day instead of
 * disappearing or re-showing the period that was already collected.
 * Returns null when there is no active monthly subscription/payment day to
 * project from (caller should render an explicit empty state, not a guess).
 */
export function nextPaymentFor(
  sub: SubscriptionDue,
  isCollected: (billingMonth: string) => boolean,
  today: Date = new Date()
): NextPaymentInfo | null {
  if (sub.status !== "active" || sub.frequency !== "monthly") return null;
  const day = sub.paymentDay ?? 1;
  const dueMonth = currentDueMonth(sub, today);
  if (!dueMonth) {
    const start = new Date(sub.startDate + "T00:00:00Z");
    return { dueDate: dateOnPaymentDay(start.getUTCFullYear(), start.getUTCMonth() + 1, day), late: false, collected: false };
  }
  const [y, m] = dueMonth.split("-").map(Number);
  if (!isCollected(dueMonth)) {
    return { dueDate: dateOnPaymentDay(y, m, day), late: isDueLate(dueMonth, today, sub.paymentDay), collected: false };
  }
  const nextMonth = new Date(Date.UTC(y, m, 1));
  return { dueDate: dateOnPaymentDay(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, day), late: false, collected: true };
}
