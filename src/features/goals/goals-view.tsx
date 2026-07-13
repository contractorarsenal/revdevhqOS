"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Plus, Star, Target, Archive, Pencil, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, sortableHeader } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { setGoalPrimary, archiveGoal } from "@/server/actions/goals";
import { METRIC_LABEL, STATUS_LABEL } from "@/lib/goals";
import type { GoalWithProgress } from "@/server/queries/goals";
import { GoalFormDialog, type GoalFormDefaults } from "./goal-form-dialog";
import { UpdateProgressDialog } from "./update-progress-dialog";
import { formatGoalValue, GoalProgressBar, GoalStatusBadge } from "./goal-ui";

type ViewTab = "active" | "history";

function toFormDefaults(g: GoalWithProgress): GoalFormDefaults {
  return {
    id: g.id, name: g.name, description: g.description, metricType: g.metricType,
    periodType: g.periodType, periodStart: g.periodStart, targetValue: g.targetValue,
    color: g.color, isPrimary: g.isPrimary, customEnd: g.periodEnd,
  };
}

/** History rows show their final outcome: achieved, behind (missed), or archived. */
function finalStatusFor(g: GoalWithProgress): { label: string; badge: React.ReactNode } {
  if (g.status === "archived" && g.computation.periodState !== "ended") {
    return { label: "Archived", badge: <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400"><span className="size-1.5 rounded-full bg-current" />Archived</span> };
  }
  const s = g.computation.status;
  return { label: STATUS_LABEL[s], badge: <GoalStatusBadge status={s} /> };
}

export function GoalsView({ active, history, today, canManage, openNew }: {
  active: GoalWithProgress[];
  history: GoalWithProgress[];
  today: string;
  canManage: boolean;
  openNew: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<ViewTab>("active");
  const [formOpen, setFormOpen] = useState(openNew && canManage);
  const [editing, setEditing] = useState<GoalFormDefaults | null>(null);
  const [progressGoal, setProgressGoal] = useState<GoalWithProgress | null>(null);
  const [metricFilter, setMetricFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const rows = tab === "active" ? active : history;
  const filtered = useMemo(
    () =>
      rows.filter((g) => {
        if (metricFilter !== "all" && g.metricType !== metricFilter) return false;
        if (periodFilter !== "all" && g.periodType !== periodFilter) return false;
        if (statusFilter !== "all") {
          const s = tab === "history" && g.status === "archived" && g.computation.periodState !== "ended" ? "archived" : g.computation.status;
          if (s !== statusFilter) return false;
        }
        return true;
      }),
    [rows, metricFilter, periodFilter, statusFilter, tab]
  );

  async function run(promise: Promise<{ ok: boolean; error?: string }>, success: string) {
    const result = await promise;
    if (!result.ok) toast.error(result.error ?? "Action failed");
    else {
      toast.success(success);
      router.refresh();
    }
  }

  const activeCols: ColumnDef<GoalWithProgress>[] = [
    {
      accessorKey: "name", header: sortableHeader("Goal"),
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5 font-semibold">
          {row.original.isPrimary && <Star aria-label="Primary goal" className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />}
          <span className="truncate">{row.original.name}</span>
        </span>
      ),
    },
    { id: "metric", header: "Metric", cell: ({ row }) => METRIC_LABEL[row.original.metricType] },
    { id: "period", header: "Period", cell: ({ row }) => row.original.periodLabel },
    {
      id: "progress", header: "Progress",
      cell: ({ row }) => {
        const g = row.original;
        return (
          <div className="min-w-[150px]">
            <p className="text-[12px] tabular-nums">
              <span className="font-semibold">{formatGoalValue(g.currentValue, g.metricType)}</span>
              <span className="text-muted-foreground"> of {formatGoalValue(g.targetValue, g.metricType)}</span>
              <span className="ml-1.5 text-muted-foreground">({Math.round(g.computation.progressPct)}%)</span>
            </p>
            <GoalProgressBar pct={g.computation.progressPct} status={g.computation.status} className="mt-1 h-1" />
          </div>
        );
      },
    },
    { id: "status", header: "Status", cell: ({ row }) => <GoalStatusBadge status={row.original.computation.status} periodState={row.original.computation.periodState} /> },
    { accessorKey: "periodEnd", header: sortableHeader("Ends"), cell: ({ row }) => row.original.periodEnd },
    {
      id: "actions", header: "",
      cell: ({ row }) => {
        const g = row.original;
        if (!canManage) return null;
        return (
          <span className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
            {g.isManual && (
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" title="Update progress" onClick={() => setProgressGoal(g)}>
                <TrendingUp className="size-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" title="Edit" onClick={() => { setEditing(toFormDefaults(g)); setFormOpen(true); }}>
              <Pencil className="size-3.5" />
            </Button>
            {!g.isPrimary && (
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" title="Make primary" onClick={() => run(setGoalPrimary(g.id), "Primary goal updated")}>
                <Star className="size-3.5" />
              </Button>
            )}
            <ConfirmationDialog
              trigger={<Button variant="ghost" size="icon" className="size-7 text-muted-foreground" title="Archive"><Archive className="size-3.5" /></Button>}
              title="Archive this goal?"
              description={`"${g.name}" moves to History with its final progress preserved.`}
              confirmLabel="Archive"
              destructive
              onConfirm={() => run(archiveGoal(g.id), "Goal archived")}
            />
          </span>
        );
      },
    },
  ];

  const historyCols: ColumnDef<GoalWithProgress>[] = [
    { accessorKey: "name", header: sortableHeader("Goal"), cell: ({ row }) => <span className="font-semibold">{row.original.name}</span> },
    { id: "metric", header: "Metric", cell: ({ row }) => METRIC_LABEL[row.original.metricType] },
    { id: "period", header: "Period", cell: ({ row }) => row.original.periodLabel },
    {
      id: "final", header: "Final progress",
      cell: ({ row }) => {
        const g = row.original;
        return (
          <span className="tabular-nums">
            <span className="font-semibold">{formatGoalValue(g.currentValue, g.metricType)}</span>
            <span className="text-muted-foreground"> of {formatGoalValue(g.targetValue, g.metricType)} ({Math.round(g.computation.progressPct)}%)</span>
          </span>
        );
      },
    },
    { id: "status", header: "Final status", cell: ({ row }) => finalStatusFor(row.original).badge },
    { accessorKey: "periodEnd", header: sortableHeader("Ended"), cell: ({ row }) => row.original.periodEnd },
  ];

  return (
    <div>
      <PageHeader title="Goals" description="Business targets with real deadlines — tracked against actual pace.">
        <div className="flex rounded-md bg-muted p-0.5">
          {(["active", "history"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded px-3 py-1 text-xs font-semibold capitalize ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              {t}
            </button>
          ))}
        </div>
        {canManage && (
          <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="size-3.5" /> New Goal
          </Button>
        )}
      </PageHeader>

      <div className="mb-3 flex flex-wrap gap-2">
        <select value={metricFilter} onChange={(e) => setMetricFilter(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-xs">
          <option value="all">All metrics</option>
          {Object.entries(METRIC_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-xs">
          <option value="all">All periods</option>
          {["weekly", "monthly", "quarterly", "annual", "custom"].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-xs">
          <option value="all">All statuses</option>
          {["achieved", "on_track", "at_risk", "behind", "neutral", ...(tab === "history" ? ["archived"] : [])].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Target}
          title={tab === "active" ? "Set your first business target" : "No goal history yet"}
          description={tab === "active" ? "Track revenue, clients, leads, or activity against a real deadline." : "Goals appear here once their period ends or they are archived."}
          action={tab === "active" && canManage ? (
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="size-3.5" /> Create goal</Button>
          ) : undefined}
        />
      ) : (
        <DataTable
          columns={tab === "active" ? activeCols : historyCols}
          data={filtered}
          searchPlaceholder="Search goals…"
          onRowClick={(g) => router.push(`/goals/${g.id}`)}
        />
      )}

      <GoalFormDialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }} goal={editing} today={today} />
      <UpdateProgressDialog open={Boolean(progressGoal)} onOpenChange={(o) => !o && setProgressGoal(null)} goal={progressGoal} />
    </div>
  );
}
