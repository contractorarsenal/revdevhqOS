import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatMoney } from "@/lib/finance/metrics";
import { PROJECT_STATUS_LABEL } from "@/features/projects/project-status";
import { PORTAL_REQUEST_STATUS } from "@/lib/portal-request-status";
import { type getPortalDashboard } from "@/server/queries/portal-data";
import type { ClientLeadMetrics } from "@/server/queries/client-leads";
import { EmptyLine, Panel, PanelLink, PortalHeading, ProgressBar, Stat } from "./portal-ui";

type Dashboard = Awaited<ReturnType<typeof getPortalDashboard>>;

export function stageLabel(status: string) {
  return PROJECT_STATUS_LABEL[status as keyof typeof PROJECT_STATUS_LABEL] ?? status;
}

export function PortalDashboardView({
  firstName, data, leadMetrics, base = "/clientportal",
}: { firstName: string; data: Dashboard; leadMetrics: ClientLeadMetrics; base?: string }) {
  const { billing } = data;
  return (
    <div>
      <PortalHeading title={`Welcome, ${firstName}`} description="Here's where your projects stand with Contractor Arsenal." />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Active projects" value={data.activeProjects.length} hint={`${data.allProjects.length} total`} />
        <Stat label="Waiting on you" value={data.waitingOnYou.length} tone={data.waitingOnYou.length > 0 ? "warn" : undefined} hint={data.waitingOnYou.length ? "needs your input" : "all clear"} />
        <Stat label="Open requests" value={data.openRequestCount} hint="submitted by you" />
        <Stat label="Website leads" value={leadMetrics.leadsThisMonth} hint={`this month · ${leadMetrics.needsResponse} need response`} />
        <Stat label="Outstanding" value={formatMoney(billing.outstanding)} tone={billing.pastDue > 0 ? "bad" : undefined} hint={billing.pastDue > 0 ? `${formatMoney(billing.pastDue)} past due` : "no balance past due"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Active projects" action={<PanelLink href={`${base}/projects`}>All projects</PanelLink>} flush>
            {data.activeProjects.length === 0 ? (
              <EmptyLine>No active projects yet. When Contractor Arsenal shares a project with you it will appear here.</EmptyLine>
            ) : (
              <ul>
                {data.activeProjects.slice(0, 5).map((p) => (
                  <li key={p.id} className="border-t border-border first:border-t-0">
                    <Link href={`${base}/projects/${p.id}`} className="block px-4 py-3 hover:bg-accent/50">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{p.name}</p>
                        <StatusBadge status={p.status} />
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <ProgressBar value={p.progress} className="flex-1" />
                        <span className="tabular-nums text-[11.5px] text-muted-foreground">{p.progress}%</span>
                      </div>
                      {p.nextAction && <p className="mt-1.5 truncate text-[12px] text-muted-foreground"><span className="font-medium text-foreground">Next:</span> {p.nextAction}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent requests" action={<PanelLink href={`${base}/requests`}>All requests</PanelLink>} flush>
            {data.recentRequests.length === 0 ? (
              <EmptyLine>You haven&apos;t submitted any requests yet.</EmptyLine>
            ) : (
              <ul>
                {data.recentRequests.map((r) => {
                  const s = PORTAL_REQUEST_STATUS[r.status];
                  return (
                    <li key={r.id} className="flex items-start gap-3 border-t border-border px-4 py-2.5 first:border-t-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{r.description}</p>
                        <p className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}{r.clientUpdate ? ` · ${r.clientUpdate}` : ""}</p>
                      </div>
                      <StatusBadge status={s?.waitingOnYou ? "waiting_on_client" : s?.done ? "completed" : "in_progress"} />
                      <span className="hidden text-[11.5px] text-muted-foreground sm:block">{s?.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Recent activity" flush>
            {data.activity.length === 0 ? (
              <EmptyLine>Meaningful updates about your account will show up here.</EmptyLine>
            ) : (
              <ul>
                {data.activity.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 border-t border-border px-4 py-2.5 first:border-t-0">
                    <span aria-hidden className="size-1.5 shrink-0 bg-primary" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{a.text}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(a.at), { addSuffix: true })}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Waiting on you" flush>
            {data.waitingOnYou.length === 0 ? (
              <EmptyLine>Nothing is waiting on you right now.</EmptyLine>
            ) : (
              <ul>
                {data.waitingOnYou.map((p) => (
                  <li key={p.id} className="border-t border-border px-4 py-2.5 first:border-t-0">
                    <Link href={`${base}/projects/${p.id}`} className="block hover:underline">
                      <p className="truncate text-[13px] font-semibold">{p.name}</p>
                      <p className="text-[12px] text-amber-600 dark:text-amber-400">{p.waitingOnLabel}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Next actions" flush>
            {data.nextActions.length === 0 ? (
              <EmptyLine>No next actions yet.</EmptyLine>
            ) : (
              <ul>
                {data.nextActions.slice(0, 5).map((a) => (
                  <li key={a.projectId} className="border-t border-border px-4 py-2.5 first:border-t-0">
                    <p className="text-[12.5px]">{a.action}</p>
                    <p className="text-[11px] text-muted-foreground">{a.projectName}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Upcoming" flush>
            {data.upcoming.length === 0 ? (
              <EmptyLine>No upcoming dates in the next 30 days.</EmptyLine>
            ) : (
              <ul>
                {data.upcoming.map((u, i) => (
                  <li key={`${u.date}-${i}`} className="flex items-center gap-3 border-t border-border px-4 py-2.5 first:border-t-0">
                    <span className="w-14 shrink-0 text-[11.5px] font-semibold tabular-nums text-muted-foreground">{format(new Date(`${u.date}T12:00:00`), "MMM d")}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{u.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Billing snapshot" action={<PanelLink href={`${base}/billing`}>Billing</PanelLink>}>
            <dl className="space-y-1.5 text-[12.5px]">
              <div className="flex justify-between"><dt className="text-muted-foreground">Active services</dt><dd className="font-semibold">{billing.subscriptions.filter((s) => s.status === "active").length}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Outstanding</dt><dd className="font-semibold tabular-nums">{formatMoney(billing.outstanding)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Paid to date</dt><dd className="font-semibold tabular-nums">{formatMoney(billing.paidTotal)}</dd></div>
            </dl>
          </Panel>

          <Panel title="Website leads" action={<PanelLink href={`${base}/leads`}>View <ArrowRight className="inline size-3" /></PanelLink>}>
            <dl className="space-y-1.5 text-[12.5px]">
              <div className="flex justify-between"><dt className="text-muted-foreground">This week</dt><dd className="font-semibold">{leadMetrics.leadsThisWeek}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">This month</dt><dd className="font-semibold">{leadMetrics.leadsThisMonth}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Needs response</dt><dd className={leadMetrics.needsResponse ? "font-semibold text-red-600 dark:text-red-400" : "font-semibold"}>{leadMetrics.needsResponse}</dd></div>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
