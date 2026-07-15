import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatMoney } from "@/lib/finance/metrics";
import { cn } from "@/lib/utils";
import type { ChangeStats } from "@/lib/reports";

/** Percent formatter that never renders a fabricated number: null stays "—". */
export function formatPercent(pct: number | null, digits = 1): string {
  if (pct === null) return "—";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(digits)}%`;
}

/**
 * Month-over-month trend chip. previous === 0 has no honest percentage
 * (would be Infinity/undefined) — shown as "New" when something appeared
 * from nothing, "—" when both months are zero. Color is never the only
 * signal: text always states the direction.
 */
export function TrendBadge({ change, isMoney = false }: { change: ChangeStats; isMoney?: boolean }) {
  if (change.percentChange === null) {
    const label = change.current > 0 ? "New" : "—";
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">{label}</span>;
  }
  const flat = change.absoluteChange === 0;
  const up = change.absoluteChange > 0;
  const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;
  const tone = flat ? "text-muted-foreground" : up ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400";
  const abs = isMoney ? formatMoney(Math.abs(change.absoluteChange)) : Math.abs(change.absoluteChange).toLocaleString("en-US");
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums", tone)}>
      <Icon className="size-3" />
      {formatPercent(change.percentChange)} ({up && !flat ? "+" : flat ? "" : "-"}
      {abs}) vs last month
    </span>
  );
}

/** Summary stat card with an optional month-over-month trend line beneath
 * the value — same shell as MetricCard, extended for report comparisons. */
export function ReportStatCard({
  label, value, change, isMoney, hint,
}: {
  label: string;
  value: React.ReactNode;
  change?: ChangeStats;
  isMoney?: boolean;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm">
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="tabular-nums mt-1 truncate text-[19px] font-semibold tracking-tight">{value}</p>
      {change ? <div className="mt-0.5">{<TrendBadge change={change} isMoney={isMoney} />}</div> : hint ? (
        <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function ReportStatGrid({ children }: { children: React.ReactNode }) {
  return <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{children}</div>;
}
