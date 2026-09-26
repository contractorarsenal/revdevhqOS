import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { ActivityTimeline, type ActivityItem } from "@/components/shared/activity-timeline";
import { formatMoney } from "@/lib/finance/metrics";
import { PROJECT_STATUS_LABEL } from "@/features/projects/project-status";
import { STAGE_ORDER, WAITING_ON_LABEL } from "@/lib/project-ops";
import type { WaitingOnParty } from "@/lib/validation";
import type { DashboardOps } from "@/server/queries/dashboard";
import { cn } from "@/lib/utils";

export type WidgetTier = "primary" | "secondary" | "support";

/** Widget chrome by importance. Primary widgets are the only ones with an
 * outline; secondary and supporting widgets sit on a borderless surface so
 * the page reads as a hierarchy instead of a wall of identical boxes. */
export function Widget({
  title, href, linkLabel = "Open", count, tone, tier = "secondary", children,
}: { title: string; href?: string; linkLabel?: string; count?: number; tone?: "alert"; tier?: WidgetTier; children: React.ReactNode }) {
  return (
    <section
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden",
        tier === "primary"
          ? "rounded-xl border border-border bg-card shadow-sm"
          : "rounded-lg bg-card/70 dark:bg-card/60"
      )}
    >
      <header className={cn("flex items-center gap-2 px-4", tier === "primary" ? "border-b border-border/60 py-3" : "pb-1.5 pt-3")}>
        <h2 className={cn("font-semibold tracking-tight", tier === "primary" ? "text-[13px]" : tier === "support" ? "text-[11px] uppercase tracking-[0.12em] text-muted-foreground" : "text-[12.5px]")}>{title}</h2>
        {count !== undefined && (
          <span className={cn("rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums", tone === "alert" && count > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{count}</span>
        )}
        {href && <Link href={href} className="ml-auto rounded-sm text-[11.5px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary">{linkLabel} →</Link>}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-5 text-[12.5px] text-muted-foreground">{children}</p>;
const Row = ({ children, href }: { children: React.ReactNode; href?: string }) =>
  href ? (
    <li className="border-t border-border/50 first:border-t-0"><Link href={href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50">{children}</Link></li>
  ) : (
    <li className="flex items-center gap-3 border-t border-border/50 px-4 py-2.5 first:border-t-0">{children}</li>
  );

export function NeedsJayWidget({ items }: { items: DashboardOps["approvals"] }) {
  return (
    <Widget title="Needs Jay" href="/approvals" linkLabel="Review all" count={items.length} tone="alert">
      {items.length === 0 ? <Empty>Nothing needs a decision right now.</Empty> : (
        <ul>
          {items.map((a) => (
            <Row key={a.id} href="/approvals">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{a.title}</p>
                <p className="truncate text-[11.5px] text-muted-foreground">
                  {[a.clientName, a.projectName].filter(Boolean).join(" · ") || "General"} · {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                </p>
                {a.requestedAction && <p className="truncate text-[11.5px]"><span className="text-muted-foreground">Decide:</span> {a.requestedAction}</p>}
              </div>
              <StatusBadge status={a.type} tone="neutral" />
            </Row>
          ))}
        </ul>
      )}
    </Widget>
  );
}

export function AttentionWidget({ items }: { items: DashboardOps["attention"] }) {
  return (
    <Widget tier="primary" title="Projects needing attention" href="/projects" linkLabel="Projects" count={items.length} tone="alert">
      {items.length === 0 ? <Empty>No projects are tripping an attention rule.</Empty> : (
        <ul>
          {items.map((p) => (
            <Row key={p.id} href={`/projects/${p.id}`}>
              <AlertTriangle className="size-3.5 shrink-0 text-amber-500" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{p.name}</p>
                <p className="truncate text-[11.5px] text-muted-foreground">{p.clientName ?? "Internal"}</p>
                <p className="mt-0.5 flex flex-wrap gap-1">
                  {p.reasons.map((r) => <span key={r} className="rounded-sm bg-red-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-red-600 dark:text-red-400">{r}</span>)}
                </p>
              </div>
            </Row>
          ))}
        </ul>
      )}
    </Widget>
  );
}

export function TodaysWorkWidget({ items }: { items: DashboardOps["todaysWork"] }) {
  return (
    <Widget tier="primary" title="Today's work" href="/tasks" linkLabel="Tasks" count={items.length}>
      {items.length === 0 ? <Empty>Nothing overdue, due today, or high priority is assigned to you.</Empty> : (
        <ul>
          {items.map((t) => (
            <Row key={t.id} href={`/tasks?open=${t.id}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{t.title}</p>
                <p className="truncate text-[11.5px] text-muted-foreground">{t.clientName ?? "No client"}{t.dueDate ? ` · ${format(new Date(t.dueDate), "MMM d")}` : ""}</p>
              </div>
              <span className="flex shrink-0 gap-1">
                {t.overdue && <span className="rounded-sm bg-red-500/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-red-600 dark:text-red-400">Overdue</span>}
                {t.dueToday && <span className="rounded-sm bg-blue-500/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-blue-600 dark:text-blue-400">Today</span>}
                {t.high && <span className="rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-600 dark:text-amber-400">{t.priority}</span>}
              </span>
            </Row>
          ))}
        </ul>
      )}
    </Widget>
  );
}

const PARTY_ORDER: WaitingOnParty[] = ["client", "jay", "ca", "third_party", "other"];

export function WaitingOnWidget({ groups }: { groups: DashboardOps["waitingGroups"] }) {
  const total = PARTY_ORDER.reduce((n, p) => n + groups[p].length, 0);
  return (
    <Widget title="Waiting on" href="/projects" linkLabel="Projects" count={total}>
      {total === 0 ? <Empty>No project is waiting on anyone.</Empty> : (
        <div>
          {PARTY_ORDER.filter((p) => groups[p].length > 0).map((p) => (
            <div key={p} className="border-t border-border/50 first:border-t-0">
              <p className="flex items-center gap-2 bg-muted/40 px-4 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {WAITING_ON_LABEL[p]} <span className="tabular-nums">{groups[p].length}</span>
              </p>
              <ul>
                {groups[p].slice(0, 4).map((g) => (
                  <Row key={g.id} href={`/projects/${g.id}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{g.name}</p>
                      <p className="truncate text-[11.5px] text-muted-foreground">{g.waitingOn ?? "—"}{g.clientName ? ` · ${g.clientName}` : ""}</p>
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{g.days}d</span>
                  </Row>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Widget>
  );
}

export function ProjectHealthWidget({ counts }: { counts: DashboardOps["stageCounts"] }) {
  const total = STAGE_ORDER.reduce((n, s) => n + counts[s], 0);
  return (
    <Widget title="Project pipeline" href="/projects" linkLabel="All projects" count={total}>
      <ul className="grid grid-cols-2 gap-px bg-border sm:grid-cols-5">
        {STAGE_ORDER.map((s) => (
          <li key={s} className="bg-card">
            <Link href="/projects" className="flex h-full flex-col justify-between gap-1 px-3 py-3 hover:bg-accent/50">
              <span className="text-[10.5px] font-medium leading-tight text-muted-foreground">{PROJECT_STATUS_LABEL[s]}</span>
              <span className={cn("tabular-nums text-[22px] font-semibold leading-none", counts[s] === 0 && "text-muted-foreground/50", s === "at_risk" && counts[s] > 0 && "text-red-600 dark:text-red-400")}>{counts[s]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Widget>
  );
}

export function ClientRequestsWidget({ data }: { data: DashboardOps["requests"] }) {
  const stats: [string, number][] = [
    ["New", data.counts.new], ["In progress", data.counts.inProgress], ["Waiting", data.counts.waiting], ["Done (7d)", data.counts.recentlyCompleted],
  ];
  return (
    <Widget title="Client requests" href="/client-requests" linkLabel="Queue" count={data.open.length}>
      <div className="grid grid-cols-4 gap-px border-b border-border bg-border">
        {stats.map(([k, v]) => (
          <div key={k} className="bg-card px-2 py-2 text-center">
            <p className="tabular-nums text-[17px] font-semibold leading-none">{v}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{k}</p>
          </div>
        ))}
      </div>
      {data.open.length === 0 ? <Empty>No open client requests.</Empty> : (
        <ul>
          {data.open.map((r) => (
            <Row key={r.id} href="/client-requests">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{r.clientName ?? "Unknown client"}</p>
                <p className="truncate text-[11.5px] text-muted-foreground">{r.description}</p>
              </div>
              <div className="shrink-0 text-right">
                <StatusBadge status={r.status} />
                <p className="mt-0.5 text-[10.5px] text-muted-foreground">{formatDistanceToNow(new Date(r.createdAt))}</p>
              </div>
            </Row>
          ))}
        </ul>
      )}
    </Widget>
  );
}

export function FinancialWidget({
  metrics, fin, overdueInvoices, renewals,
}: {
  metrics: { collectedToday: number; collectedThisMonth: number; mrr: number; outstanding: number; pastDue: number };
  fin: DashboardOps["financial"];
  overdueInvoices: { id: string; number: string; clientName: string | null; balance: number }[];
  renewals: { id: string; clientId: string; clientName: string | null; nextBillingDate: string | null; amount: string }[];
}) {
  const rows: [string, string, boolean?][] = [
    ["Collected today", formatMoney(metrics.collectedToday)],
    ["Collected this month", formatMoney(metrics.collectedThisMonth)],
    ["Payments this week", `${formatMoney(fin.paymentsThisWeek)} · ${fin.paymentCountThisWeek}`],
    ["MRR", formatMoney(metrics.mrr)],
    ["Outstanding", formatMoney(metrics.outstanding)],
    ["Past due", formatMoney(metrics.pastDue), metrics.pastDue > 0],
    ["Recurring still due this cycle", `${formatMoney(fin.expectedRecurring)} · ${fin.dueSubscriptionCount} subs`],
  ];
  return (
    <Widget title="Financial snapshot" href="/billing" linkLabel="Billing">
      <dl className="divide-y divide-border">
        {rows.map(([k, v, bad]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-4 py-2 text-[12.5px]">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className={cn("tabular-nums font-semibold", bad && "text-red-600 dark:text-red-400")}>{v}</dd>
          </div>
        ))}
      </dl>
      {(overdueInvoices.length > 0 || renewals.length > 0) && (
        <ul className="border-t border-border">
          {overdueInvoices.slice(0, 3).map((i) => (
            <Row key={i.id} href={`/billing?tab=invoices&open=${i.id}`}>
              <span aria-hidden className="h-6 w-0.5 shrink-0 bg-red-500" />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">Invoice {i.number} overdue · {i.clientName}</span>
              <span className="tabular-nums text-[12px] font-semibold text-red-600 dark:text-red-400">{formatMoney(i.balance)}</span>
            </Row>
          ))}
          {renewals.slice(0, 3).map((r) => (
            <Row key={r.id} href={`/clients/${r.clientId}`}>
              <span aria-hidden className="h-6 w-0.5 shrink-0 bg-amber-500" />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">Renewal · {r.clientName} · {r.nextBillingDate}</span>
              <span className="tabular-nums text-[12px] font-semibold">{formatMoney(r.amount)}</span>
            </Row>
          ))}
        </ul>
      )}
    </Widget>
  );
}

export function UpcomingWidget({ ops }: { ops: DashboardOps }) {
  const label = (d: string) => (d === ops.today ? "Today" : d === ops.tomorrow ? "Tomorrow" : format(new Date(`${d}T12:00:00`), "EEE, MMM d"));
  const items = [
    ...ops.upcoming.map((e) => ({ key: `e-${e.id}`, date: e.date, title: e.title, sub: e.allDay ? "All day" : e.startTime ?? "", href: e.taskId ? `/tasks?open=${e.taskId}` : `/calendar?event=${e.id}` })),
    ...ops.deadlines.map((d) => ({ key: `d-${d.id}`, date: d.dueDate, title: `${d.name} — target date`, sub: d.clientName ?? "", href: `/projects/${d.id}` })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  return (
    <Widget tier="support" title="Upcoming" href="/calendar" linkLabel="Calendar" count={items.length}>
      {items.length === 0 ? <Empty>Nothing scheduled in the next 7 days.</Empty> : (
        <ul>
          {items.map((i) => (
            <Row key={i.key} href={i.href}>
              <span className="w-[4.5rem] shrink-0 text-[11px] font-semibold text-muted-foreground">{label(i.date)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{i.title}</p>
                {i.sub && <p className="truncate text-[11.5px] text-muted-foreground">{i.sub}</p>}
              </div>
            </Row>
          ))}
        </ul>
      )}
    </Widget>
  );
}

export function SalesPipelineWidget({ sales, pipelineValue, weighted }: { sales: DashboardOps["sales"]; pipelineValue: number; weighted: number }) {
  const max = Math.max(1, ...sales.stages.map((s) => s.count));
  return (
    <Widget tier="support" title="Sales pipeline" href="/pipeline" linkLabel="Pipeline">
      <p className="border-b border-border px-4 py-2 text-[11px] text-muted-foreground">Contractor Arsenal prospects only — separate from client website leads.</p>
      <div className="grid grid-cols-3 gap-px border-b border-border bg-border text-center">
        {[["Open leads", String(sales.openLeads)], ["Pipeline", formatMoney(pipelineValue)], ["Weighted", formatMoney(weighted)]].map(([k, v]) => (
          <div key={k} className="bg-card px-2 py-2"><p className="tabular-nums text-[15px] font-semibold">{v}</p><p className="text-[10px] text-muted-foreground">{k}</p></div>
        ))}
      </div>
      {sales.stages.length === 0 ? <Empty>No pipeline stages configured.</Empty> : (
        <ul className="space-y-1.5 px-4 py-3">
          {sales.stages.map((s) => (
            <li key={s.stage} className="flex items-center gap-2 text-[12px]">
              <span className="w-28 shrink-0 truncate text-muted-foreground">{s.stage}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(s.count / max) * 100}%` }} /></span>
              <span className="w-6 text-right tabular-nums font-semibold">{s.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}

export function ClientLeadsWidget({ data }: { data: DashboardOps["clientLeads"] }) {
  return (
    <Widget tier="support" title="Client website leads" href="/clients" linkLabel="Clients">
      <p className="border-b border-border px-4 py-2 text-[11px] text-muted-foreground">Leads generated FOR our clients — separate from the sales pipeline.</p>
      <div className="grid grid-cols-3 gap-px bg-border text-center">
        {[["Today", data.today], ["This week", data.week], ["Need response", data.needsResponse]].map(([k, v]) => (
          <div key={String(k)} className="bg-card px-2 py-3">
            <p className={cn("tabular-nums text-[22px] font-semibold leading-none", k === "Need response" && Number(v) > 0 && "text-red-600 dark:text-red-400")}>{v}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{k}</p>
          </div>
        ))}
      </div>
    </Widget>
  );
}

export function TeamWorkloadWidget({ items }: { items: DashboardOps["workload"] }) {
  const max = Math.max(1, ...items.map((w) => w.open));
  return (
    <Widget tier="support" title="Team workload" href="/tasks" linkLabel="Tasks">
      {items.length === 0 ? <Empty>No open tasks.</Empty> : (
        <ul className="space-y-2 px-4 py-3">
          {items.map((w) => (
            <li key={w.assigneeId ?? "none"} className="text-[12px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{w.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {w.open} open{w.overdue > 0 && <span className="font-semibold text-red-600 dark:text-red-400"> · {w.overdue} overdue</span>}
                </span>
              </div>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(w.open / max) * 100}%` }} /></span>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}

export function ActivityWidget({ items }: { items: ActivityItem[] }) {
  return (
    <Widget tier="support" title="Recent activity">
      <div className="px-4 py-3"><ActivityTimeline items={items} /></div>
    </Widget>
  );
}
