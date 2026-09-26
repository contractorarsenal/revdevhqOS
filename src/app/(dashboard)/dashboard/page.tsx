import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/session";
import { timed } from "@/lib/dev/timing";
import {
  getDashboardMetrics, getOperationalMetrics, getMrrTrend, getCollectedByMonth, getRecentActivity, getAttentionQueue,
} from "@/server/queries/metrics";
import { getDashboardLayout, getDashboardOps } from "@/server/queries/dashboard";
import { getDashboardGoals } from "@/server/queries/goals";
import { DashboardGoals } from "@/features/goals/dashboard-goals";
import { DashboardGrid, type DashboardWidgetDef } from "@/features/dashboard/dashboard-grid";
import {
  ActivityWidget, AttentionWidget, ClientLeadsWidget, ClientRequestsWidget, FinancialWidget, NeedsJayWidget,
  ProjectHealthWidget, SalesPipelineWidget, TeamWorkloadWidget, TodaysWorkWidget, UpcomingWidget, WaitingOnWidget,
} from "@/features/dashboard/widgets";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { MrrTrendChart, CollectedChart } from "@/features/reports/charts";
import { formatMoney, invoiceBalance } from "@/lib/finance/metrics";
import { Inbox } from "lucide-react";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

// Date-sensitive: days remaining, pace, and due states must be computed at
// request time in the workspace timezone — time moves even when no mutation
// fires a revalidation, so this page must never be statically frozen.
export const dynamic = "force-dynamic";

function Kpi({ label, value, hint, href, tone, hintTone }: { label: string; value: React.ReactNode; hint?: string; href: string; tone?: "alert" | "bad"; hintTone?: "bad" }) {
  return (
    <Link href={href} className="group/kpi min-w-0 bg-card px-4 py-3.5 outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary active:bg-accent">
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={`tabular-nums mt-1 truncate text-[24px] font-semibold leading-none tracking-tight ${tone === "alert" ? "text-primary" : ""}`}>{value}</p>
      {hint && <p className={`mt-1.5 truncate text-[11.5px] ${hintTone === "bad" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{hint}</p>}
    </Link>
  );
}

export default async function DashboardPage() {
  const ctx = await requireWorkspace();
  const wsId = ctx.workspace.id;
  const tz = ctx.workspace.timezone;
  const [metrics, operational, mrrTrend, collected, activity, attention, goals, ops, layout] =
    await timed("dashboard queries", () => Promise.all([
      getDashboardMetrics(wsId, tz),
      getOperationalMetrics(wsId, tz),
      getMrrTrend(wsId),
      getCollectedByMonth(wsId, tz),
      getRecentActivity(wsId, 14),
      getAttentionQueue(wsId),
      getDashboardGoals(wsId, tz),
      getDashboardOps(wsId, tz, ctx.user.id),
      getDashboardLayout(ctx.user.id, wsId),
    ]));

  const firstName = ctx.user.name.split(" ")[0];
  const hasAnyData = metrics.mrr > 0 || metrics.activeClients > 0 || operational.activeProjects > 0;
  const pendingCount = ops.approvals.length;

  const widgets: DashboardWidgetDef[] = [
    { id: "needs_jay", title: "Needs Jay", span: 4, node: <NeedsJayWidget items={ops.approvals} /> },
    { id: "attention", title: "Projects needing attention", span: 6, node: <AttentionWidget items={ops.attention} /> },
    { id: "todays_work", title: "Today's work", span: 6, node: <TodaysWorkWidget items={ops.todaysWork} /> },
    { id: "waiting_on", title: "Waiting on", node: <WaitingOnWidget groups={ops.waitingGroups} /> },
    { id: "project_health", title: "Project pipeline", span: 8, node: <ProjectHealthWidget counts={ops.stageCounts} /> },
    { id: "client_requests", title: "Client requests", node: <ClientRequestsWidget data={ops.requests} /> },
    {
      id: "financial", title: "Financial snapshot",
      node: (
        <FinancialWidget
          metrics={metrics} fin={ops.financial}
          overdueInvoices={attention.overdueInvoices.map((i) => ({ id: i.id, number: i.number, clientName: i.clientName, balance: invoiceBalance(i) }))}
          renewals={attention.renewals}
        />
      ),
    },
    { id: "upcoming", title: "Upcoming", node: <UpcomingWidget ops={ops} /> },
    { id: "sales_pipeline", title: "Sales pipeline", node: <SalesPipelineWidget sales={ops.sales} pipelineValue={metrics.pipelineValue} weighted={metrics.weightedPipeline} /> },
    { id: "client_leads", title: "Client website leads", node: <ClientLeadsWidget data={ops.clientLeads} /> },
    { id: "team_workload", title: "Team workload", node: <TeamWorkloadWidget items={ops.workload} /> },
    { id: "activity", title: "Recent activity", span: 8, node: <ActivityWidget items={activity} /> },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">{greeting()}, {firstName}</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            <Link href="/clients" className="hover:text-foreground hover:underline">{metrics.activeClients} active clients</Link>
            {" · "}<Link href="/projects" className="hover:text-foreground hover:underline">{operational.activeProjects} active projects</Link>
            {" · "}<Link href="/tasks" className="hover:text-foreground hover:underline">{metrics.tasksDueToday} tasks due today{metrics.tasksOverdue ? ` (${metrics.tasksOverdue} overdue)` : ""}</Link>
          </p>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-sm md:grid-cols-5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
        <Kpi label="Collected today" value={formatMoney(metrics.collectedToday)} href="/billing?tab=payments" />
        <Kpi label="Collected MTD" value={formatMoney(metrics.collectedThisMonth)} href="/billing?tab=payments" />
        <Kpi label="MRR" value={formatMoney(metrics.mrr)} href="/billing" />
        <Kpi
          label="Outstanding" value={formatMoney(metrics.outstanding)} href="/billing?tab=invoices"
          hint={metrics.pastDue > 0 ? `${formatMoney(metrics.pastDue)} past due` : "nothing past due"} tone={metrics.pastDue > 0 ? "bad" : undefined} hintTone={metrics.pastDue > 0 ? "bad" : undefined}
        />
        <Kpi label="Needs Jay" value={pendingCount} tone={pendingCount > 0 ? "alert" : undefined} hint={pendingCount ? "pending decisions" : "all clear"} href="/approvals" />
      </div>

      <DashboardGrid widgets={widgets} layout={layout} />

      <div className="mt-4">
        <DashboardGoals primary={goals.primary} others={goals.others} totalActive={goals.totalActive} />
      </div>

      {!hasAnyData && (
        <div className="mb-4">
          <EmptyState
            icon={Inbox}
            title="Your workspace is empty"
            description="Add your first client to start tracking services, billing, and work."
            action={<Button asChild size="sm"><Link href="/clients?new=1">Add your first client</Link></Button>}
          />
        </div>
      )}

      <details className="mt-4 rounded-md border border-border bg-card">
        <summary className="cursor-pointer list-none px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground [&::-webkit-details-marker]:hidden">
          Revenue trends
        </summary>
        <div className="grid gap-4 border-t border-border p-4 xl:grid-cols-2">
          <div>
            <h2 className="mb-1 text-[12.5px] font-semibold">MRR trend <span className="font-normal text-muted-foreground">· trailing 12 months</span></h2>
            <MrrTrendChart data={mrrTrend} />
          </div>
          <div>
            <h2 className="mb-1 text-[12.5px] font-semibold">Collected revenue <span className="font-normal text-muted-foreground">· per month</span></h2>
            <CollectedChart data={collected} />
          </div>
        </div>
      </details>
    </div>
  );
}
