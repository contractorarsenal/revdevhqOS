import { CheckCircle2, Users, LifeBuoy, TrendingUp, FileBarChart } from "lucide-react";
import { PORTAL_ROLE_LABEL, type ClientPortalRole, type ClientPortalStatus } from "@/lib/portal";
import type { ClientLeadSummary } from "@/server/queries/client-leads";

/**
 * The minimal client-facing overview for this phase. Presentational — the
 * caller (portal page or internal preview) supplies all data, so preview
 * mode can never trigger client-only actions. No fake numbers: the lead
 * summary is real or an explicit empty state, and future modules are
 * labeled coming soon.
 */
export function PortalOverview({
  businessName, accent, role, status, memberName, leadSummary,
}: {
  businessName: string;
  accent: string;
  role: ClientPortalRole;
  status: ClientPortalStatus;
  memberName: string;
  leadSummary: ClientLeadSummary;
}) {
  const futureModules = [
    { icon: Users, label: "Leads", note: "Coming soon" },
    { icon: LifeBuoy, label: "Support Requests", note: "Coming soon" },
    { icon: TrendingUp, label: "Google Rankings", note: "Coming soon" },
    { icon: FileBarChart, label: "Progress Reports", note: "Coming soon" },
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
        <header className="border-b border-border/60 px-4 py-2.5">
          <h2 className="text-[12.5px] font-semibold">Lead activity</h2>
        </header>
        {leadSummary.total === 0 ? (
          <p className="px-4 py-5 text-[12.5px] text-muted-foreground">
            No leads recorded yet. New leads will appear here as they come in.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4">
            {(
              [
                ["This week", leadSummary.thisWeek],
                ["This month", leadSummary.thisMonth],
                ["Total leads", leadSummary.total],
                ["Won", leadSummary.won],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="bg-card px-4 py-3">
                <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums" style={label === "This week" ? { color: accent } : undefined}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
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
