/** Pure helpers for bulk payment entry (no I/O). */

export function monthOf(dateYmd: string): string {
  return dateYmd.slice(0, 7);
}

/** Row key used for in-batch soft-duplicate detection. */
export function softDuplicateKey(r: { clientId: string; amount: number; paidAt: string }): string {
  return `${r.clientId}|${Number(r.amount).toFixed(2)}|${r.paidAt}`;
}

/** Row key used for hard (subscription + billing month) duplicate detection. */
export function subscriptionMonthKey(subscriptionId: string, billingMonthYm: string): string {
  return `${subscriptionId}|${billingMonthYm}`;
}

export function sumRows(rows: { amount: number }[]): number {
  return Math.round(rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0) * 100) / 100;
}
