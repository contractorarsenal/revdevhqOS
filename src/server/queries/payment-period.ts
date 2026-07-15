import { and, eq, gte, isNotNull, isNull, lt, lte, or, type SQL } from "drizzle-orm";
import { payments } from "@/lib/db/schema";
import { zonedTimeToUtc } from "@/lib/date-tz";
import { addDaysStr, type Period } from "@/lib/goals";

/**
 * SQL mirror of lib/finance/metrics.ts's paymentBelongsToPeriod — the ONE
 * WHERE clause for "succeeded revenue attributable to this workspace-local
 * period". Kept parameterized (no db import, not "server-only") so PGlite
 * integration tests can prove it agrees with the pure TS rule.
 *
 * Exactly one branch matches per payment, so nothing is double-counted:
 * - billing_month set → the billing month (a date) must fall inside the
 *   period's calendar dates. Authoritative regardless of when collected.
 * - billing_month null → paid_at must fall inside the period's UTC window
 *   [00:00 of start, 00:00 of the day after end) in the workspace timezone.
 */
export function revenuePaymentInPeriod(workspaceId: string, period: Period, timezone: string): SQL {
  const bounds = periodUtcBounds(period, timezone);
  return and(
    eq(payments.workspaceId, workspaceId),
    eq(payments.status, "succeeded"),
    or(
      and(
        isNotNull(payments.billingMonth),
        gte(payments.billingMonth, period.start),
        lte(payments.billingMonth, period.end)
      ),
      and(
        isNull(payments.billingMonth),
        gte(payments.paidAt, bounds.start),
        lt(payments.paidAt, bounds.end)
      )
    )
  )!;
}

/** UTC instants covering a workspace-local calendar period: [00:00 on
 * start, 00:00 on the day after end). DST-safe via zonedTimeToUtc. */
export function periodUtcBounds(period: Period, timezone: string): { start: Date; end: Date } {
  return {
    start: zonedTimeToUtc(period.start, "00:00", timezone),
    end: zonedTimeToUtc(addDaysStr(period.end, 1), "00:00", timezone),
  };
}
