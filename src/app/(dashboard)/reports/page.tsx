import { requireWorkspace } from "@/lib/auth/session";
import { getDashboardMetrics, getMrrTrend, getCollectedByMonth } from "@/server/queries/metrics";
import { getRevenueByClient, getMrrByService } from "@/server/queries/reports";
import { getExpensesForMonth } from "@/server/queries/expenses";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard, MetricGrid } from "@/components/shared/metric-card";
import { FinancialAmount } from "@/components/shared/financial-amount";
import { MrrTrendChart, CollectedChart } from "@/features/reports/charts";
import { formatMoney } from "@/lib/finance/metrics";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { todayInTimezone } from "@/lib/date-tz";
import { BarChart3, CalendarRange } from "lucide-react";
import Link from "next/link";

// Date-sensitive: month boundaries and "this month" totals must be computed
// at request time, never frozen by any static/ISR optimization.
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const ctx = await requireWorkspace();
  const wsId = ctx.workspace.id;
  const monthStart = `${todayInTimezone(ctx.workspace.timezone).slice(0, 7)}-01`;
  const [metrics, mrrTrend, collected, revenueByClient, mrrByService, monthExpenses] = await Promise.all([
    getDashboardMetrics(wsId, ctx.workspace.timezone),
    getMrrTrend(wsId),
    getCollectedByMonth(wsId, ctx.workspace.timezone),
    getRevenueByClient(wsId),
    getMrrByService(wsId),
    getExpensesForMonth(wsId, monthStart),
  ]);
  const profit = metrics.collectedThisMonth - monthExpenses;
  const margin = metrics.collectedThisMonth > 0 ? Math.round((profit / metrics.collectedThisMonth) * 100) : null;
  const totalCollected12mo = collected.reduce((sum, m) => sum + m.collected, 0);
  const maxServiceMrr = Math.max(1, ...mrrByService.map((s) => s.mrr));

  return (
    <div>
      <PageHeader title="Reports" description="Revenue, retention, and pipeline reporting — computed from live records.">
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href="/reports/monthly"><CalendarRange className="size-3.5" /> Monthly Report</Link>
        </Button>
      </PageHeader>

      <MetricGrid>
        <MetricCard label="MRR" value={formatMoney(metrics.mrr)} hint="current" />
        <MetricCard label="ARR" value={formatMoney(metrics.arr)} hint="MRR × 12" />
        <MetricCard label="Collected · 12 mo" value={formatMoney(totalCollected12mo)} hint="successful payments" />
        <MetricCard label="Collected this month" value={formatMoney(metrics.collectedThisMonth)} />
        <MetricCard label="Open pipeline" value={formatMoney(metrics.pipelineValue)} hint={`weighted ${formatMoney(metrics.weightedPipeline)}`} />
        <MetricCard label="This month expenses" value={formatMoney(monthExpenses)} />
        <MetricCard label="This month profit" value={formatMoney(profit)} hint={margin !== null ? `${margin}% margin` : undefined} />
      </MetricGrid>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-2 text-[13px] font-semibold">MRR trend</h2>
          <MrrTrendChart data={mrrTrend} />
        </section>
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-2 text-[13px] font-semibold">Collected revenue by month</h2>
          <CollectedChart data={collected} />
        </section>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border/60 px-4 py-2.5">
            <h2 className="text-[12.5px] font-semibold">Revenue by client</h2>
          </header>
          {revenueByClient.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={BarChart3} title="No payment data yet" description="Record payments to see revenue by client." />
            </div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border/60 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2">Client</th>
                  <th className="px-4 py-2 text-right">Payments</th>
                  <th className="px-4 py-2 text-right">Collected</th>
                </tr>
              </thead>
              <tbody>
                {revenueByClient.map((r) => (
                  <tr key={r.clientId} className="border-t border-border/40">
                    <td className="px-4 py-2 font-medium">{r.clientName}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{r.paymentCount}</td>
                    <td className="px-4 py-2 text-right"><FinancialAmount value={r.collected} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border/60 px-4 py-2.5">
            <h2 className="text-[12.5px] font-semibold">MRR by service</h2>
          </header>
          {mrrByService.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={BarChart3} title="No subscription data yet" description="Create subscriptions to see MRR by service." />
            </div>
          ) : (
            <div className="space-y-2.5 px-4 py-3.5">
              {mrrByService.map((s) => (
                <div key={s.name} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-[12.5px] font-medium">{s.name}</span>
                  <div className="h-3.5 flex-1 overflow-hidden rounded bg-muted">
                    <div className="h-full rounded bg-[var(--chart-1)]" style={{ width: `${(s.mrr / maxServiceMrr) * 100}%` }} />
                  </div>
                  <FinancialAmount value={s.mrr} className="w-20 text-right text-[12.5px]" />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
