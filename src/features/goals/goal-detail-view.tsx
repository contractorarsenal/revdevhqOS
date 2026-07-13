"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { ChevronLeft, Pencil, Star, Archive, TrendingUp, CopyPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { setGoalPrimary, archiveGoal, duplicateGoalForNextPeriod } from "@/server/actions/goals";
import { METRIC_LABEL } from "@/lib/goals";
import type { GoalWithProgress, GoalProgressUpdate } from "@/server/queries/goals";
import { GoalFormDialog, type GoalFormDefaults } from "./goal-form-dialog";
import { UpdateProgressDialog } from "./update-progress-dialog";
import { formatGoalValue, formatPace, GoalProgressBar, GoalStatusBadge, GOAL_STATUS_STYLE } from "./goal-ui";

export function GoalDetailView({ goal, progressUpdates, today, canManage, openEdit }: {
  goal: GoalWithProgress;
  progressUpdates: GoalProgressUpdate[];
  today: string;
  canManage: boolean;
  openEdit: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(openEdit && canManage && goal.status !== "archived");
  const [progressOpen, setProgressOpen] = useState(false);
  const c = goal.computation;
  const style = GOAL_STATUS_STYLE[c.status];

  const defaults: GoalFormDefaults = {
    id: goal.id, name: goal.name, description: goal.description, metricType: goal.metricType,
    periodType: goal.periodType, periodStart: goal.periodStart, targetValue: goal.targetValue,
    color: goal.color, isPrimary: goal.isPrimary, customEnd: goal.periodEnd,
  };

  async function run(promise: Promise<{ ok: boolean; error?: string }>, success: string) {
    const result = await promise;
    if (!result.ok) toast.error(result.error ?? "Action failed");
    else {
      toast.success(success);
      router.refresh();
    }
  }

  async function duplicate() {
    const result = await duplicateGoalForNextPeriod(goal.id);
    if (!result.ok) return toast.error(result.error ?? "Could not duplicate");
    toast.success("Goal created for the next period");
    if (result.data?.id) router.push(`/goals/${result.data.id}`);
  }

  const stats: [string, React.ReactNode][] = [
    ["Current value", <span key="v" className="font-semibold tabular-nums">{formatGoalValue(goal.currentValue, goal.metricType)}</span>],
    ["Target", <span key="t" className="font-semibold tabular-nums">{formatGoalValue(goal.targetValue, goal.metricType)}</span>],
    ["Progress", <span key="p" className={`font-semibold tabular-nums ${style.text}`}>{Math.round(c.progressPct)}%</span>],
    ["Expected by today", <span key="e" className="tabular-nums">{formatGoalValue(c.expectedValue, goal.metricType)} ({Math.round(c.expectedPct)}%)</span>],
    ["Remaining", <span key="r" className="tabular-nums">{formatGoalValue(c.remainingValue, goal.metricType)}</span>],
    ["Days remaining", <span key="d" className="tabular-nums">{c.periodState === "ended" ? "Period ended" : c.periodState === "upcoming" ? `Starts ${goal.periodStart}` : c.remainingDays}</span>],
    ["Current pace", <span key="cp" className="tabular-nums">{c.currentPace === null ? "—" : formatPace(c.currentPace, goal.metricType)}</span>],
    ["Required pace", <span key="rp" className="tabular-nums">{c.requiredPace === null ? "—" : formatPace(c.requiredPace, goal.metricType)}</span>],
    ["Projected finish", <span key="pf" className="tabular-nums">{c.projectedValue === null ? "Not enough data yet" : formatGoalValue(c.projectedValue, goal.metricType)}</span>],
    ["Created", format(new Date(goal.createdAt), "MMM d, yyyy")],
    ["Last updated", format(new Date(goal.updatedAt), "MMM d, yyyy · h:mm a")],
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/goals" className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3.5" /> All goals
      </Link>

      <header className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            {goal.isPrimary && <Star aria-label="Primary goal" className="size-4 shrink-0 fill-amber-400 text-amber-400" />}
            {goal.name}
          </h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {METRIC_LABEL[goal.metricType]} · {goal.periodLabel}
            {goal.status === "archived" && " · Archived"}
          </p>
          {goal.description && <p className="mt-1.5 text-[13px] text-muted-foreground">{goal.description}</p>}
        </div>
        <GoalStatusBadge status={c.status} periodState={c.periodState} />
      </header>

      <section className="mt-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="text-3xl font-semibold tabular-nums tracking-tight">
          {formatGoalValue(goal.currentValue, goal.metricType)}
          <span className="ml-2 text-base font-normal text-muted-foreground">of {formatGoalValue(goal.targetValue, goal.metricType)}</span>
        </p>
        <GoalProgressBar pct={c.progressPct} status={c.status} className="mt-3 h-2" />
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-2">
          {stats.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1.5 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {canManage && (
        <div className="mt-3 flex flex-wrap gap-2">
          {goal.status !== "archived" && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setFormOpen(true)}>
              <Pencil className="size-3.5" /> Edit
            </Button>
          )}
          {goal.isManual && goal.status !== "archived" && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setProgressOpen(true)}>
              <TrendingUp className="size-3.5" /> Update Progress
            </Button>
          )}
          {!goal.isPrimary && goal.status === "active" && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => run(setGoalPrimary(goal.id), "Primary goal updated")}>
              <Star className="size-3.5" /> Make Primary
            </Button>
          )}
          {(c.periodState === "ended" || goal.status === "archived") && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={duplicate}>
              <CopyPlus className="size-3.5" /> Duplicate for next period
            </Button>
          )}
          {goal.status !== "archived" && (
            <ConfirmationDialog
              trigger={<Button size="sm" variant="outline" className="gap-1.5 text-muted-foreground"><Archive className="size-3.5" /> Archive</Button>}
              title="Archive this goal?"
              description={`"${goal.name}" moves to History with its final progress preserved.`}
              confirmLabel="Archive"
              destructive
              onConfirm={() => run(archiveGoal(goal.id), "Goal archived")}
            />
          )}
        </div>
      )}

      {goal.isManual && progressUpdates.length > 0 && (
        <section className="mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border/60 px-4 py-2.5">
            <h2 className="text-[12.5px] font-semibold">Progress history</h2>
          </header>
          <ul>
            {progressUpdates.map((u) => (
              <li key={u.id} className="flex items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0">
                <span className="text-[12.5px] font-semibold tabular-nums">
                  {formatGoalValue(u.previousValue, goal.metricType)} → {formatGoalValue(u.newValue, goal.metricType)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">{u.note ?? ""}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {u.createdByName ? `${u.createdByName} · ` : ""}{format(new Date(u.createdAt), "MMM d, h:mm a")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <GoalFormDialog open={formOpen} onOpenChange={setFormOpen} goal={defaults} today={today} />
      <UpdateProgressDialog open={progressOpen} onOpenChange={setProgressOpen} goal={progressOpen ? goal : null} />
    </div>
  );
}
