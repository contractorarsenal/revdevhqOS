import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/session";
import { timed } from "@/lib/dev/timing";
import {
  getDashboardMetrics, getMrrTrend, getCollectedByMonth, getRecentActivity, getAttentionQueue,
} from "@/server/queries/metrics";
import { listPayments } from "@/server/queries/billing";
import { listDueSubscriptions } from "@/server/queries/recurring";
import { listTodaySchedule } from "@/server/queries/calendar";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard, MetricGrid } from "@/components/shared/metric-card";
import { ActivityTimeline } from "@/components/shared/activity-timeline";
import { FinancialAmount } from "@/components/shared/financial-amount";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { MrrTrendChart, CollectedChart } from "@/features/reports/charts";
import { formatMoney, invoiceBalance } from "@/lib/finance/metrics";
import { AlertTriangle, ArrowRight, DollarSign, Inbox } from "lucide-react";
import { format } from "date-fns";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const ctx = await requireWorkspace();
  const wsId = ctx.workspace.id;
  const [metrics, mrrTrend, collected, activity, attention, payments, dueSubs, todaySchedule] = await timed("dashboard queries", () => Promise.all([
    getDashboardMetrics(wsId, ctx.workspace.timezone),
    getMrrTrend(wsId),
    getCollectedByMonth(wsId),
    getRecentActivity(wsId),
    getAttentionQueue(wsId),
    listPayments(wsId),
    listDueSubscriptions(wsId),
    listTodaySchedule(wsId),
  ]));
  const firstName = ctx.user.name.split(" ")[0];
  const hasAnyData = metrics.mrr > 0 || metrics.activeClients > 0 || payments.length > 0;
  const attentionCount = attention.overdueInvoices.length + attention.overdueTasks.length + attention.renewals.length;

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description="Here is what is happening across the agency today — every number below comes from your database."
      />

      <MetricGrid>
        <MetricCard label="MRR" value={formatMoney(metrics.mrr)} hint="active subscriptions" />
        <MetricCard label="ARR" value={formatMoney(metrics.arr)} hint="MRR × 12" />
        <MetricCard label="Collected today" value={formatMoney(metrics.collectedToday)} hint={`month: ${formatMoney(metrics.collectedThisMonth)}`} />
        <MetricCard label="Active clients" value={metrics.activeClients} hint="incl. onboarding" />
        <MetricCard label="Outstanding" value={formatMoney(metrics.outstanding)} hint="unpaid invoices" />
        <MetricCard label="Past-due" value={formatMoney(metrics.pastDue)} hint="past the due date" />
      </MetricGrid>

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
                  <li key={inv.id} className="flex items-center gap-2.5 border-t border-border/40 px-4 py-2.5 first:border-t-0">
                    <span className="h-7 w-0.5 rounded-full bg-red-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">Invoice {inv.number} overdue</p>
                      <p className="truncate text-[11px] text-muted-foreground">{inv.clientName} · due {inv.dueDate}</p>
                    </div>
                    <FinancialAmount value={invoiceBalance(inv)} className="text-red-700 dark:text-red-400" />
                  </li>
                ))}
                {attention.overdueTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2.5 border-t border-border/40 px-4 py-2.5 first:border-t-0">
                    <span className="h-7 w-0.5 rounded-full bg-red-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">{t.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {t.clientName ? `${t.clientName} · ` : ""}task overdue
                      </p>
                    </div>
                    <AlertTriangle className="size-3.5 text-red-600" />
                  </li>
                ))}
                {attention.renewals.map((r) => (
                  <li key={r.id} className="flex items-center gap-2.5 border-t border-border/40 px-4 py-2.5 first:border-t-0">
                    <span className="h-7 w-0.5 rounded-full bg-amber-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">Renewal — {r.clientName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">bills {r.nextBillingDate}</p>
                    </div>
                    <FinancialAmount value={r.amount} />
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
                  <li key={ev.id} className="flex items-center gap-2.5 border-t border-border/40 px-4 py-2.5 first:border-t-0">
                    <span className="w-14 shrink-0 text-[11.5px] font-semibold tabular-nums text-muted-foreground">
                      {new Date(ev.startAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </span>
                    {ev.clientId ? (
                      <Link href={`/clients/${ev.clientId}`} className="min-w-0 flex-1 hover:underline">
                        <p className="truncate text-[12.5px] font-medium">{ev.title}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{ev.clientName}</p>
                      </Link>
                    ) : (
                      <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{ev.title}</p>
                    )}
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
