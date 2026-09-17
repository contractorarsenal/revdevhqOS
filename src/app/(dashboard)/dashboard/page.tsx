import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/session";
import { timed } from "@/lib/dev/timing";
import {
  getDashboardMetrics, getOperationalMetrics, getMrrTrend, getCollectedByMonth, getRecentActivity, getAttentionQueue,
} from "@/server/queries/metrics";
import { listApprovals } from "@/server/queries/approvals";
import { listPayments } from "@/server/queries/billing";
import { listDueSubscriptions } from "@/server/queries/recurring";
import { listTodayFeed } from "@/server/queries/calendar";
import { listTasks } from "@/server/queries/tasks";
import { listProjects } from "@/server/queries/projects";
import { getDashboardGoals } from "@/server/queries/goals";
import { DashboardGoals } from "@/features/goals/dashboard-goals";
import { todayInTimezone, dayBoundsInTimezone, formatTimeLabel } from "@/lib/date-tz";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard, MetricGrid } from "@/components/shared/metric-card";
import { ActivityTimeline } from "@/components/shared/activity-timeline";
import { FinancialAmount } from "@/components/shared/financial-amount";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { MrrTrendChart, CollectedChart } from "@/features/reports/charts";
import { formatMoney, invoiceBalance } from "@/lib/finance/metrics";
import { AlertTriangle, ArrowRight, DollarSign, Inbox, Gavel, Clock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

// Date-sensitive: days remaining, pace, and due states must be computed at
// request time in the workspace timezone — time moves even when no mutation
// fires a revalidation, so this page must never be statically frozen.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requireWorkspace();
  const wsId = ctx.workspace.id;
  const today = todayInTimezone(ctx.workspace.timezone);
  const { start: todayStart, end: todayEnd } = dayBoundsInTimezone(ctx.workspace.timezone, today);
  const [metrics, operational, mrrTrend, collected, activity, attention, payments, dueSubs, todaySchedule, goals, approvals, tasksAll, projectsAll] =
    await timed("dashboard queries", () => Promise.all([
      getDashboardMetrics(wsId, ctx.workspace.timezone),
      getOperationalMetrics(wsId, ctx.workspace.timezone),
      getMrrTrend(wsId),
      getCollectedByMonth(wsId, ctx.workspace.timezone),
      getRecentActivity(wsId),
      getAttentionQueue(wsId),
      listPayments(wsId),
      listDueSubscriptions(wsId, ctx.workspace.timezone),
      listTodayFeed(wsId, todayStart, todayEnd, ctx.workspace.timezone),
      getDashboardGoals(wsId, ctx.workspace.timezone),
      listApprovals(wsId),
      listTasks(wsId),
      listProjects(wsId),
    ]));
  const firstName = ctx.user.name.split(" ")[0];
  const hasAnyData = metrics.mrr > 0 || metrics.activeClients > 0 || payments.length > 0;
  const attentionCount = attention.overdueInvoices.length + attention.overdueTasks.length + attention.renewals.length;

  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const waitingTasks = tasksAll.filter((t) => t.status === "waiting").slice(0, 5);
  const ACTIVE_PROJECT_STATUSES = new Set(["ready_to_build", "building", "client_review", "revisions", "ready_to_launch"]);
  const activeWorkProjects = projectsAll.filter((p) => ACTIVE_PROJECT_STATUSES.has(p.status)).slice(0, 4);
  const activeWorkTasks = tasksAll.filter((t) => t.status === "in_progress").slice(0, 4);

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description="Here is what is happening across the agency today — every number below comes from your database."
      />

      <MetricGrid>
        <Link href="/approvals" className="min-w-0 rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm hover:bg-muted/30">
          <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Needs Jay</p>
          <p className="tabular-nums mt-1 truncate text-[19px] font-semibold tracking-tight">{pendingApprovals.length}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{pendingApprovals.length === 0 ? "all clear" : "pending decisions"}</p>
        </Link>
        <Link href="/leads" className="min-w-0 rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm hover:bg-muted/30">
          <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Open leads</p>
          <p className="tabular-nums mt-1 truncate text-[19px] font-semibold tracking-tight">{operational.openLeads}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">agency prospects</p>
        </Link>
        <MetricCard label="Active clients" value={metrics.activeClients} hint="incl. onboarding" />
        <Link href="/projects" className="min-w-0 rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm hover:bg-muted/30">
          <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Active projects</p>
          <p className="tabular-nums mt-1 truncate text-[19px] font-semibold tracking-tight">{operational.activeProjects}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">queued through pre-launch</p>
        </Link>
        <Link href="/tasks" className="min-w-0 rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm hover:bg-muted/30">
          <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Waiting on client</p>
          <p className="tabular-nums mt-1 truncate text-[19px] font-semibold tracking-tight">{operational.waitingOnClient}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">tasks blocked</p>
        </Link>
        <Link href="/leads" className="min-w-0 rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm hover:bg-muted/30">
          <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Client leads today</p>
          <p className="tabular-nums mt-1 truncate text-[19px] font-semibold tracking-tight">{operational.clientLeadsToday}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">generated for clients</p>
        </Link>
      </MetricGrid>

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
            <Gavel className="size-3.5 text-muted-foreground" />
            <h2 className="text-[12.5px] font-semibold">Needs Jay</h2>
            <Link href="/approvals" className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline">
              All <ArrowRight className="size-3" />
            </Link>
          </header>
          {pendingApprovals.length === 0 ? (
            <p className="px-4 py-4 text-xs text-muted-foreground">Nothing needs a decision right now.</p>
          ) : (
            <ul>
              {pendingApprovals.slice(0, 4).map((a) => (
                <li key={a.id} className="border-t border-border/40 first:border-t-0">
                  <Link href="/approvals" className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/30">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">{a.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {a.requestedByName ?? "Someone"} · {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
            <h2 className="text-[12.5px] font-semibold">Active work</h2>
          </header>
          {activeWorkProjects.length === 0 && activeWorkTasks.length === 0 ? (
            <p className="px-4 py-4 text-xs text-muted-foreground">Nothing in motion right now.</p>
          ) : (
            <ul>
              {activeWorkProjects.map((p) => (
                <li key={`project-${p.id}`} className="border-t border-border/40 first:border-t-0">
                  <Link href={`/projects/${p.id}`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/30">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">{p.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{p.clientName ?? "Internal"} · project</p>
                    </div>
                  </Link>
                </li>
              ))}
              {activeWorkTasks.map((t) => (
                <li key={`task-${t.id}`} className="border-t border-border/40 first:border-t-0">
                  <Link href={`/tasks?open=${t.id}`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/30">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">{t.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{t.clientName ? `${t.clientName} · ` : ""}task</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
            <Clock className="size-3.5 text-muted-foreground" />
            <h2 className="text-[12.5px] font-semibold">Waiting</h2>
          </header>
          {waitingTasks.length === 0 ? (
            <p className="px-4 py-4 text-xs text-muted-foreground">Nothing waiting on a client right now.</p>
          ) : (
            <ul>
              {waitingTasks.map((t) => (
                <li key={t.id} className="border-t border-border/40 first:border-t-0">
                  <Link href={`/tasks?open=${t.id}`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/30">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">{t.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{t.clientName ? `${t.clientName} · ` : ""}waiting</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <details className="mb-4 rounded-lg border border-border bg-card shadow-sm">
        <summary className="cursor-pointer list-none px-4 py-2.5 text-[12.5px] font-semibold [&::-webkit-details-marker]:hidden">
          Financial snapshot
        </summary>
        <div className="border-t border-border/60 px-4 py-3">
          <MetricGrid>
            <MetricCard label="MRR" value={formatMoney(metrics.mrr)} hint="active subscriptions" />
            <MetricCard label="ARR" value={formatMoney(metrics.arr)} hint="MRR × 12" />
            <MetricCard label="Collected today" value={formatMoney(metrics.collectedToday)} hint={`month: ${formatMoney(metrics.collectedThisMonth)}`} />
            <MetricCard label="Outstanding" value={formatMoney(metrics.outstanding)} hint="unpaid invoices" />
            <MetricCard label="Past-due" value={formatMoney(metrics.pastDue)} hint="past the due date" />
          </MetricGrid>
        </div>
      </details>

      <DashboardGoals primary={goals.primary} others={goals.others} totalActive={goals.totalActive} />

      {!hasAnyData && (
        <div className="mb-4">
          <EmptyState
            icon={Inbox}
            title="Your workspace is empty"
            description="Add a client with a subscription, or run the demo seed (npm run db:seed) to explore with sample data."
            action={
              <Button asChild size="sm">
                <Link href="/clients?new=1">Add your first client</Link>
              </Button>
            }
          />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm xl:col-span-2">
          <div className="mb-2 flex items-baseline gap-3">
            <h2 className="text-[13px] font-semibold">MRR trend</h2>
            <p className="text-[11.5px] text-muted-foreground">Derived from subscription start / cancel dates · trailing 12 months</p>
          </div>
          <MrrTrendChart data={mrrTrend} />
          <div className="mt-4 border-t border-border/60 pt-3">
            <div className="mb-2 flex items-baseline gap-3">
              <h2 className="text-[13px] font-semibold">Collected revenue</h2>
              <p className="text-[11.5px] text-muted-foreground">Successful payments per month</p>
            </div>
            <CollectedChart data={collected} />
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
              <h2 className="text-[12.5px] font-semibold">Needs attention</h2>
              {attentionCount > 0 && (
                <span className="rounded-full bg-red-50 px-1.5 text-[10.5px] font-semibold tabular-nums text-red-700 dark:bg-red-950 dark:text-red-400">
                  {attentionCount}
                </span>
              )}
            </header>
            {attentionCount === 0 ? (
              <p className="px-4 py-4 text-xs text-muted-foreground">Nothing needs attention right now.</p>
            ) : (
              <ul>
                {attention.overdueInvoices.map((inv) => (
                  <li key={inv.id} className="border-t border-border/40 first:border-t-0">
                    <Link href={`/billing?tab=invoices&open=${inv.id}`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/30">
                      <span className="h-7 w-0.5 shrink-0 rounded-full bg-red-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium">Invoice {inv.number} overdue</p>
                        <p className="truncate text-[11px] text-muted-foreground">{inv.clientName} · due {inv.dueDate}</p>
                      </div>
                      <FinancialAmount value={invoiceBalance(inv)} className="text-red-700 dark:text-red-400" />
                    </Link>
                  </li>
                ))}
                {attention.overdueTasks.map((t) => (
                  <li key={t.id} className="border-t border-border/40 first:border-t-0">
                    <Link href={`/tasks?open=${t.id}`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/30">
                      <span className="h-7 w-0.5 shrink-0 rounded-full bg-red-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium">{t.title}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {t.clientName ? `${t.clientName} · ` : ""}task overdue
                        </p>
                      </div>
                      <AlertTriangle className="size-3.5 shrink-0 text-red-600" />
                    </Link>
                  </li>
                ))}
                {attention.renewals.map((r) => (
                  <li key={r.id} className="border-t border-border/40 first:border-t-0">
                    <Link href={`/clients/${r.clientId}`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/30">
                      <span className="h-7 w-0.5 shrink-0 rounded-full bg-amber-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium">Renewal — {r.clientName}</p>
                        <p className="truncate text-[11px] text-muted-foreground">bills {r.nextBillingDate}</p>
                      </div>
                      <FinancialAmount value={r.amount} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {todaySchedule.length > 0 && (
            <section className="rounded-lg border border-border bg-card shadow-sm">
              <header className="flex items-center border-b border-border/60 px-4 py-2.5">
                <h2 className="text-[12.5px] font-semibold">Today&apos;s Schedule</h2>
                <Link href="/calendar" className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline">
                  Calendar <ArrowRight className="size-3" />
                </Link>
              </header>
              <ul>
                {todaySchedule.map((ev) => (
                  <li key={`${ev.kind}-${ev.id}`} className="border-t border-border/40 first:border-t-0">
                    <Link
                      href={ev.kind === "task" ? `/tasks?open=${ev.taskId}` : `/calendar?event=${ev.id}`}
                      className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted/30"
                    >
                      <span className="w-14 shrink-0 text-[11.5px] font-semibold tabular-nums text-muted-foreground">
                        {ev.allDay ? "All day" : formatTimeLabel(ev.displayStartTime)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium">{ev.title}</p>
                        {ev.clientName && <p className="truncate text-[11px] text-muted-foreground">{ev.clientName}</p>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {dueSubs.length > 0 && (
            <section className="rounded-lg border border-amber-300 bg-amber-50 shadow-sm dark:border-amber-900 dark:bg-amber-950/40">
              <header className="flex items-center border-b border-amber-300/60 px-4 py-2.5 dark:border-amber-900/60">
                <h2 className="text-[12.5px] font-semibold">Due recurring payments</h2>
                <span className="ml-auto rounded-full bg-amber-100 px-1.5 text-[10.5px] font-semibold tabular-nums text-amber-800 dark:bg-amber-900 dark:text-amber-300">{dueSubs.length}</span>
              </header>
              <ul>
                {dueSubs.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-center gap-2.5 border-t border-amber-300/40 px-4 py-2.5 first:border-t-0 dark:border-amber-900/40">
                    <Link href={`/clients/${s.clientId}`} className="min-w-0 flex-1 hover:underline">
                      <p className="truncate text-[12.5px] font-medium">{s.clientName}</p>
                      <p className="text-[11px] text-muted-foreground">{s.late ? "late" : "due"}</p>
                    </Link>
                    <FinancialAmount value={s.amount} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-lg border border-border bg-card shadow-sm">
            <header className="flex items-center border-b border-border/60 px-4 py-2.5">
              <h2 className="text-[12.5px] font-semibold">Pipeline</h2>
              <Link href="/pipeline" className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline">
                Open <ArrowRight className="size-3" />
              </Link>
            </header>
            <dl className="space-y-2 px-4 py-3 text-[12.5px]">
              <div className="flex justify-between"><dt className="text-muted-foreground">Open pipeline</dt><dd><FinancialAmount value={metrics.pipelineValue} /></dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Weighted</dt><dd><FinancialAmount value={metrics.weightedPipeline} /></dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Tasks due today</dt><dd className="tabular-nums font-semibold">{metrics.tasksDueToday}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Overdue tasks</dt><dd className="tabular-nums font-semibold">{metrics.tasksOverdue}</dd></div>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-card shadow-sm">
            <header className="flex items-center border-b border-border/60 px-4 py-2.5">
              <h2 className="text-[12.5px] font-semibold">Recent payments</h2>
              <Link href="/billing?tab=payments" className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline">
                Billing <ArrowRight className="size-3" />
              </Link>
            </header>
            {payments.length === 0 ? (
              <p className="px-4 py-4 text-xs text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <ul>
                {payments.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5 border-t border-border/40 px-4 py-2.5 first:border-t-0">
                    <span className="flex size-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                      <DollarSign className="size-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">{p.clientName ?? "Payment"}</p>
                      <p className="text-[11px] text-muted-foreground">{format(new Date(p.paidAt), "MMM d")} · {p.method ?? "—"}</p>
                    </div>
                    <FinancialAmount value={p.amount} className="text-emerald-700 dark:text-emerald-400" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="mt-4 rounded-lg border border-border bg-card px-4 py-4 shadow-sm">
        <h2 className="mb-3 text-[12.5px] font-semibold">Recent activity</h2>
        <ActivityTimeline items={activity} />
      </section>
    </div>
  );
}
