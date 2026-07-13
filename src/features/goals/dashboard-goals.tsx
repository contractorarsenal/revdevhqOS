import Link from "next/link";
import { ArrowRight, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GoalWithProgress } from "@/server/queries/goals";
import { formatGoalValue, formatPace, GoalProgressBar, GoalStatusBadge, GOAL_STATUS_STYLE } from "./goal-ui";

/** Server-renderable dashboard section: one emphasized primary goal plus up
 * to four compact goal cards. Whole small cards are links; the primary card
 * uses explicit links so nothing interactive is nested. */
export function DashboardGoals({ primary, others, totalActive }: {
  primary: GoalWithProgress | null;
  others: GoalWithProgress[];
  totalActive: number;
}) {
  if (totalActive === 0) {
    return (
      <section aria-labelledby="goals-heading" className="mb-4">
        <div className="mb-2 flex items-baseline">
          <h2 id="goals-heading" className="text-[13px] font-semibold">Goals</h2>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border bg-card px-6 py-8 text-center">
          <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Target className="size-4.5" />
          </div>
          <p className="text-[13px] font-semibold">Set your first business target</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Track revenue, clients, leads, or activity against a real deadline.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link href="/goals?new=1">Create goal</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="goals-heading" className="mb-4">
      <div className="mb-2 flex items-baseline gap-3">
        <h2 id="goals-heading" className="text-[13px] font-semibold">Goals</h2>
        <Link href="/goals" className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline">
          Manage goals <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {primary && <PrimaryGoalCard goal={primary} />}
        {others.length > 0 && (
          <div className={`grid content-start gap-3 sm:grid-cols-2 ${primary ? "lg:col-span-2" : "lg:col-span-3 sm:grid-cols-2 lg:grid-cols-4"}`}>
            {others.map((g) => <SmallGoalCard key={g.id} goal={g} />)}
          </div>
        )}
      </div>
    </section>
  );
}

function PrimaryGoalCard({ goal }: { goal: GoalWithProgress }) {
  const c = goal.computation;
  const style = GOAL_STATUS_STYLE[c.status];
  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold">{goal.name}</p>
          <p className="text-[11px] text-muted-foreground">{goal.periodLabel}</p>
        </div>
        <GoalStatusBadge status={c.status} periodState={c.periodState} />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight">
        {formatGoalValue(goal.currentValue, goal.metricType)}
        <span className="ml-1.5 text-sm font-normal text-muted-foreground">of {formatGoalValue(goal.targetValue, goal.metricType)}</span>
      </p>
      <p className={`mt-0.5 text-[11.5px] font-semibold tabular-nums ${style.text}`}>
        {Math.round(c.progressPct)}% achieved
      </p>
      <GoalProgressBar pct={c.progressPct} status={c.status} className="mt-2" />
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Remaining</dt><dd className="font-semibold tabular-nums">{formatGoalValue(c.remainingValue, goal.metricType)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Days left</dt><dd className="font-semibold tabular-nums">{c.periodState === "ended" ? "Ended" : c.remainingDays}</dd></div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Required</dt>
          <dd className="font-semibold tabular-nums">{c.requiredPace === null ? "—" : formatPace(c.requiredPace, goal.metricType)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Projected</dt>
          <dd className="font-semibold tabular-nums">{c.projectedValue === null ? "Not enough data yet" : formatGoalValue(c.projectedValue, goal.metricType)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex gap-3 border-t border-border/60 pt-2.5 text-[11.5px] font-semibold">
        <Link href={`/goals/${goal.id}?edit=1`} className="text-muted-foreground hover:text-foreground hover:underline">Edit</Link>
        <Link href={`/goals/${goal.id}`} className="text-primary hover:underline">View details</Link>
      </div>
    </article>
  );
}

function SmallGoalCard({ goal }: { goal: GoalWithProgress }) {
  const c = goal.computation;
  return (
    <Link
      href={`/goals/${goal.id}`}
      className="block rounded-lg border border-border bg-card p-3 shadow-sm transition-colors hover:border-muted-foreground/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[12px] font-semibold">{goal.name}</p>
        <GoalStatusBadge status={c.status} periodState={c.periodState} />
      </div>
      <p className="mt-1.5 text-[13px] font-semibold tabular-nums">
        {formatGoalValue(goal.currentValue, goal.metricType)}
        <span className="font-normal text-muted-foreground"> of {formatGoalValue(goal.targetValue, goal.metricType)}</span>
      </p>
      <GoalProgressBar pct={c.progressPct} status={c.status} className="mt-1.5" />
      <p className="mt-1.5 text-[10.5px] text-muted-foreground">
        {goal.periodLabel} · {c.periodState === "ended" ? "ended" : c.periodState === "upcoming" ? "starts soon" : `${c.remainingDays}d left`}
      </p>
    </Link>
  );
}
