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

function Kpi({ label, value, hint, href, tone }: { label: string; value: React.ReactNode; hint?: string; href: string; tone?: "alert" | "bad" }) {
  return (
    <Link href={href} className="min-w-0 rounded-md border border-border bg-card px-3 py-2.5 transition-colors hover:border-muted-foreground/40 focus-visible:outline-2 focus-visible:outline-primary">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={`tabular-nums mt-1 truncate text-[20px] font-semibold leading-tight tracking-tight ${tone === "bad" ? "text-red-600 dark:text-red-400" : tone === "alert" ? "text-primary" : ""}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
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
    { id: "needs_jay", title: "Needs Jay", node: <NeedsJayWidget items={ops.approvals} /> },
    { id: "attention", title: "Projects needing attention", node: <AttentionWidget items={ops.attention} /> },
    { id: "todays_work", title: "Today's work", node: <TodaysWorkWidget items={ops.todaysWork} /> },
    { id: "waiting_on", title: "Waiting on", node: <WaitingOnWidget groups={ops.waitingGroups} /> },
    { id: "project_health", title: "Project pipeline", wide: true, node: <ProjectHealthWidget counts={ops.stageCounts} /> },
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
    { id: "activity", title: "Recent activity", wide: true, node: <ActivityWidget items={activity} /> },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{greeting()}, {firstName}</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">Operating state across Contractor Arsenal — every number comes from live records.</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        <Kpi label="Collected today" value={formatMoney(metrics.collectedToday)} href="/billing?tab=payments" />
        <Kpi label="Collected MTD" value={formatMoney(metrics.collectedThisMonth)} href="/billing?tab=payments" />
        <Kpi label="MRR" value={formatMoney(metrics.mrr)} href="/billing" />
        <Kpi label="Outstanding" value={formatMoney(metrics.outstanding)} href="/billing?tab=invoices" />
        <Kpi label="Past due" value={formatMoney(metrics.pastDue)} tone={metrics.pastDue > 0 ? "bad" : undefined} href="/billing?tab=invoices" />
        <Kpi label="Active clients" value={metrics.activeClients} hint="incl. onboarding" href="/clients" />
        <Kpi label="Active projects" value={operational.activeProjects} hint="ready to build → launch" href="/projects" />
        <Kpi label="Needs Jay" value={pendingCount} tone={pendingCount > 0 ? "alert" : undefined} hint={pendingCount ? "pending decisions" : "all clear"} href="/approvals" />
        <Kpi label="Tasks due today" value={metrics.tasksDueToday} hint={metrics.tasksOverdue ? `${metrics.tasksOverdue} overdue` : undefined} href="/tasks" />
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
