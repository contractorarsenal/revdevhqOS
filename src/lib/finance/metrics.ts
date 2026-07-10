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
