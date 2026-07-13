import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance/metrics";
import { isMoneyMetric, STATUS_LABEL, type GoalMetricType, type GoalPaceStatus } from "@/lib/goals";

/** One value formatter for every goal surface: money metrics render as
 * currency, activity metrics as plain counts. */
export function formatGoalValue(value: number, metric: GoalMetricType): string {
  if (isMoneyMetric(metric)) return formatMoney(value);
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export function formatPace(perDay: number, metric: GoalMetricType): string {
  if (isMoneyMetric(metric)) {
    return `${perDay.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })}/day`;
  }
  const rounded = perDay >= 10 ? Math.round(perDay).toLocaleString("en-US") : perDay.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return `${rounded}/day`;
}

/** Restrained status palette: text + bar classes per status. Text always
 * accompanies color — color is never the only signal. */
export const GOAL_STATUS_STYLE: Record<GoalPaceStatus, { text: string; bar: string; badge: string }> = {
  achieved: { text: "text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  on_track: { text: "text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  at_risk: { text: "text-amber-700 dark:text-amber-400", bar: "bg-amber-500", badge: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  behind: { text: "text-red-700 dark:text-red-400", bar: "bg-red-500", badge: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400" },
  neutral: { text: "text-slate-500 dark:text-slate-400", bar: "bg-slate-400", badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};

export function GoalStatusBadge({ status, periodState }: { status: GoalPaceStatus; periodState?: string }) {
  const label = status === "neutral" && periodState === "upcoming" ? "Upcoming" : STATUS_LABEL[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", GOAL_STATUS_STYLE[status].badge)}>
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

/** Thin progress line. The fill is visually capped at 100% while the
 * numeric label elsewhere shows the real (possibly >100%) percentage. */
export function GoalProgressBar({ pct, status, className }: { pct: number; status: GoalPaceStatus; className?: string }) {
  const width = Math.min(100, Math.max(0, pct));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div className={cn("h-full rounded-full transition-[width]", GOAL_STATUS_STYLE[status].bar)} style={{ width: `${width}%` }} />
    </div>
  );
}
