import Link from "next/link";
import { ArrowRight, CheckCircle2, LifeBuoy, TrendingUp, FileBarChart } from "lucide-react";
import { PORTAL_ROLE_LABEL, type ClientPortalRole, type ClientPortalStatus } from "@/lib/portal";
import { formatMoney } from "@/lib/finance/metrics";
import type { ClientLeadMetrics } from "@/server/queries/client-leads";

/**
 * The client-facing portal home. Presentational — the caller (portal page
 * or internal preview) supplies all data, so preview mode can never
 * trigger client-only actions. No fake numbers: every metric is real or an
 * explicit empty state, and modules not yet built are labeled coming soon.
 */
export function PortalOverview({
  businessName, accent, role, status, memberName, leadMetrics,
}: {
  businessName: string;
  accent: string;
  role: ClientPortalRole;
  status: ClientPortalStatus;
  memberName: string;
  leadMetrics: ClientLeadMetrics;
}) {
  const futureModules = [
    { icon: LifeBuoy, label: "Support Requests", note: "Coming soon" },
    { icon: TrendingUp, label: "Google Rankings", note: "Coming soon" },
    { icon: FileBarChart, label: "Progress Reports", note: "Coming soon" },
  ];

  const topStats: [string, number | string][] = [
    ["Leads This Week", leadMetrics.leadsThisWeek],
    ["Leads This Month", leadMetrics.leadsThisMonth],
    ["Total Leads", leadMetrics.totalLeads],
    ["Avg / Month", leadMetrics.avgLeadsPerMonth],
  ];

  const operationalStats: [string, number, string?][] = [
    ["New", leadMetrics.newCount],
    ["Needs Response", leadMetrics.needsResponse, leadMetrics.needsResponse > 0 ? "text-red-700 dark:text-red-400" : undefined],
    ["Contacted", leadMetrics.contacted],
    ["Estimate Scheduled", leadMetrics.estimateScheduled],
    ["Won", leadMetrics.won, "text-emerald-700 dark:text-emerald-400"],
    ["Lost", leadMetrics.lost],
  ];

  return (
    <div className="space-y-4">
      <section>
        <h1 className="text-xl font-semibold tracking-tight">Welcome, {memberName.split(" ")[0]}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Exclusive access for active Contractor Arsenal clients.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div id="account" className="scroll-mt-20 rounded-lg border border-border bg-card p-4 shadow-sm">
          <h2 className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Your account</h2>
          <dl className="mt-2.5 space-y-1.5 text-[12.5px]">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Business</dt><dd className="text-right font-medium">{businessName}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Role</dt><dd className="font-medium">{PORTAL_ROLE_LABEL[role]}</dd></div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="flex items-center gap-1.5 font-medium capitalize">
                <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: status === "active" ? "#059669" : "#D97706" }} />
                {status}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Onboarding</h2>
            <CheckCircle2 aria-hidden className="size-4" style={{ color: accent }} />
          </div>
          <p className="mt-2.5 text-[13px] font-semibold">Your account is set up</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Your business details are already on file with Contractor Arsenal — nothing else is
            needed from you right now.
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
          <h2 className="text-[12.5px] font-semibold">Leads</h2>
          <Link href="/portal/leads" className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold hover:underline" style={{ color: accent }}>
            View all <ArrowRight className="size-3" />
          </Link>
        </header>
        {leadMetrics.totalLeads === 0 ? (
          <p className="px-4 py-5 text-[12.5px] text-muted-foreground">
            No leads recorded yet. New leads will appear here as they come in.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4">
              {topStats.map(([label, value]) => (
                <div key={label} className="bg-card px-4 py-3">
                  <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums" style={label === "Leads This Week" ? { color: accent } : undefined}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <dl className="grid grid-cols-3 gap-px border-t border-border/60 bg-border/60 sm:grid-cols-6">
              {operationalStats.map(([label, value, color]) => (
                <div key={label} className="bg-card px-3 py-2.5">
                  <dt className="truncate text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
                  <dd className={`mt-0.5 text-[15px] font-semibold tabular-nums ${color ?? ""}`}>{value}</dd>
                </div>
              ))}
            </dl>
            {(leadMetrics.estimatedPipelineValue > 0 || leadMetrics.confirmedRevenue > 0) && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border/60 px-4 py-2.5 text-[11.5px]">
                {leadMetrics.estimatedPipelineValue > 0 && (
                  <span className="text-muted-foreground">
                    Estimated Pipeline Value <span className="font-semibold tabular-nums text-foreground">{formatMoney(leadMetrics.estimatedPipelineValue)}</span>
                  </span>
                )}
                {leadMetrics.confirmedRevenue > 0 && (
                  <span className="text-muted-foreground">
                    Confirmed Revenue{" "}
                    <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{formatMoney(leadMetrics.confirmedRevenue)}</span>
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[12.5px] font-semibold">What&apos;s next in your Command Center</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {futureModules.map((m) => (
            <div key={m.label} className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-card/60 px-3.5 py-3">
              <m.icon aria-hidden className="size-4 text-muted-foreground" />
              <span className="flex-1 text-[12.5px] font-medium text-muted-foreground">{m.label}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{m.note}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
