import Link from "next/link";
import { ChevronLeft, Target } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { FinancialAmount } from "@/components/shared/financial-amount";
import { formatMoney } from "@/lib/finance/metrics";
import { formatGoalValue, GoalStatusBadge } from "@/features/goals/goal-ui";
import type { MonthlyReport } from "@/server/queries/monthly-report";
import type { ReportableMonth } from "@/server/queries/monthly-report";
import { MonthSelector } from "./month-selector";
import { ReportStatCard, ReportStatGrid, formatPercent, TrendBadge } from "./report-ui";
import { RevenueExpenseProfitChart, RevenueByClientChart, GoalProgressChart } from "./monthly-charts";

export function MonthlyReportView({
  report, months, selectedValue,
}: {
  report: MonthlyReport;
  months: ReportableMonth[];
  selectedValue: string;
}) {
  const r = report;

  return (
    <div>
      <Link href="/reports" className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3.5" /> Reports
      </Link>
      <PageHeader title="Monthly Report" description={`${r.periodLabel} — computed from live records, never estimated.`}>
        <MonthSelector months={months} selectedValue={selectedValue} />
      </PageHeader>

      {/* ===== Summary ===== */}
      <ReportStatGrid>
        <ReportStatCard label="Revenue" value={formatMoney(r.revenue.current)} change={r.revenue} isMoney />
        <ReportStatCard label="Expenses" value={formatMoney(r.expenses.current)} change={r.expenses} isMoney />
        <ReportStatCard label="Profit" value={formatMoney(r.profit.current)} change={r.profit} isMoney />
        <ReportStatCard label="Margin" value={r.margin === null ? "—" : formatPercent(r.margin, 1)} hint={r.margin === null ? "no revenue this month" : undefined} />
        <ReportStatCard label="New clients" value={r.newClients.current.toLocaleString()} change={r.newClients} />
        <ReportStatCard label="New leads" value={r.newLeads.current.toLocaleString()} change={r.newLeads} />
        <ReportStatCard label="Projects completed" value={r.projectsCompleted.toLocaleString()} />
        <ReportStatCard label="Tasks completed" value={r.tasksCompleted.toLocaleString()} />
        <ReportStatCard label="Payments collected" value={r.revenueStats.paymentCount.toLocaleString()} />
        <ReportStatCard label="Average payment" value={formatMoney(r.revenueStats.averagePayment)} />
        <ReportStatCard label="Largest payment" value={formatMoney(r.revenueStats.largestPayment)} />
        <ReportStatCard label="Outstanding invoices" value={formatMoney(r.outstandingInvoices.outstanding)} hint={`${r.outstandingInvoices.count} invoice${r.outstandingInvoices.count === 1 ? "" : "s"}`} />
      </ReportStatGrid>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ===== Goal ===== */}
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-[13px] font-semibold">Revenue goal</h2>
          {r.goal ? (
            <>
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-[13px] font-medium">{r.goal.name}</p>
                <GoalStatusBadge status={r.goal.computation.status} periodState={r.goal.computation.periodState} />
              </div>
              <GoalProgressChart progressPct={r.goal.computation.progressPct} status={r.goal.computation.status} />
              <dl className="mt-4 space-y-1.5 text-[12.5px]">
                <div className="flex justify-between"><dt className="text-muted-foreground">Target</dt><dd className="font-semibold tabular-nums">{formatMoney(r.goal.targetValue)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Actual revenue</dt><dd className="font-semibold tabular-nums">{formatMoney(r.goal.computation.current)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Remaining</dt><dd className="font-semibold tabular-nums">{formatGoalValue(r.goal.computation.remainingValue, "revenue_collected")}</dd></div>
              </dl>
            </>
          ) : (
            <EmptyState icon={Target} title="No revenue goal was set for this month" description="Create a monthly revenue goal for this period to see progress here." />
          )}
        </section>

        {/* ===== Revenue vs Expenses vs Profit chart ===== */}
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm xl:col-span-2">
          <h2 className="mb-3 text-[13px] font-semibold">Revenue vs expenses vs profit</h2>
          <RevenueExpenseProfitChart revenue={r.revenue.current} expenses={r.expenses.current} profit={r.profit.current} />
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {/* ===== Revenue breakdown ===== */}
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border/60 px-4 py-2.5">
            <h2 className="text-[12.5px] font-semibold">Revenue breakdown</h2>
          </header>
          {r.revenueStats.collected === 0 ? (
            <p className="px-4 py-4 text-xs text-muted-foreground">No revenue collected this month.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 px-4 py-3">
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">One-time</p>
                  <p className="tabular-nums text-[15px] font-semibold">{formatMoney(r.revenueBreakdown.oneTime)}</p>
                </div>
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Recurring</p>
                  <p className="tabular-nums text-[15px] font-semibold">{formatMoney(r.revenueBreakdown.recurring)}</p>
                </div>
              </div>
              <div className="border-t border-border/40">
                {r.revenueBreakdown.byClient.slice(0, 8).map((c) => (
                  <div key={c.clientId ?? "none"} className="flex items-center justify-between gap-2 border-t border-border/40 px-4 py-2 first:border-t-0 text-[12.5px]">
                    <span className="min-w-0 truncate">{c.clientName ?? "No client"}</span>
                    <FinancialAmount value={c.amount} className="text-[12.5px]" />
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* ===== Revenue by client chart ===== */}
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-[13px] font-semibold">Revenue by client</h2>
          {r.revenueBreakdown.byClient.length === 0 ? (
            <p className="text-xs text-muted-foreground">No revenue collected this month.</p>
          ) : (
            <RevenueByClientChart data={r.revenueBreakdown.byClient.map((c) => ({ clientName: c.clientName ?? "No client", amount: c.amount }))} />
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {/* ===== Expense breakdown ===== */}
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border/60 px-4 py-2.5">
            <h2 className="text-[12.5px] font-semibold">Expense breakdown</h2>
          </header>
          {r.expenseBreakdown.total === 0 ? (
            <p className="px-4 py-4 text-xs text-muted-foreground">No expenses recorded for this month.</p>
          ) : (
            <div className="px-4 py-3 space-y-2.5">
              {r.expenseBreakdown.byCategory.map((c) => (
                <div key={c.category} className="flex items-center justify-between text-[12.5px]">
                  <span className="capitalize text-muted-foreground">{c.category.replace("_", " ")}</span>
                  <FinancialAmount value={c.amount} className="text-[12.5px]" />
                </div>
              ))}
              {r.expenseBreakdown.largest && (
                <div className="mt-2 border-t border-border/40 pt-2 text-[11.5px] text-muted-foreground">
                  Largest: <span className="font-medium text-foreground">{r.expenseBreakdown.largest.name}</span> ({formatMoney(r.expenseBreakdown.largest.amount)})
                </div>
              )}
            </div>
          )}
        </section>

        {/* ===== Leads & pipeline ===== */}
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border/60 px-4 py-2.5">
            <h2 className="text-[12.5px] font-semibold">Leads &amp; pipeline</h2>
          </header>
          <dl className="space-y-2 px-4 py-3 text-[12.5px]">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">New leads</dt>
              <dd className="flex items-center gap-2">
                <span className="font-semibold tabular-nums">{r.newLeads.current}</span>
                <TrendBadge change={r.newLeads} />
              </dd>
            </div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Opportunities won</dt><dd className="font-semibold tabular-nums">{r.opportunities.wonCount} ({formatMoney(r.opportunities.wonValue)})</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Opportunities lost</dt><dd className="font-semibold tabular-nums">{r.opportunities.lostCount}</dd></div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Win rate (decided this month)</dt>
              <dd className="font-semibold tabular-nums">{r.opportunities.winRate === null ? "No data available" : `${r.opportunities.winRate}%`}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
