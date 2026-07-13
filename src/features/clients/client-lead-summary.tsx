import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { formatMoney } from "@/lib/finance/metrics";
import type { ClientLeadSummary } from "@/server/queries/client-leads";

/** Real, client-scoped lead performance. Archived leads are excluded (see
 * clientLeadSummary). Renders an explicit empty state — never fake counts. */
export function ClientLeadSummaryCard({ summary, clientName }: { summary: ClientLeadSummary; clientName: string }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
        <h2 className="text-[12.5px] font-semibold">Leads Performance</h2>
        <Link href="/leads" className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline">
          All leads <ArrowRight className="size-3" />
        </Link>
      </header>
      {summary.total === 0 ? (
        <div className="flex items-center gap-3 px-4 py-5">
          <Users className="size-4 text-muted-foreground" />
          <p className="text-[12.5px] text-muted-foreground">
            No leads linked to {clientName} yet. Link leads to this client from the Leads page.
          </p>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4">
            {(
              [
                ["This week", summary.thisWeek],
                ["This month", summary.thisMonth],
                ["Total leads", summary.total],
                ["Avg / month", summary.avgPerMonth],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="bg-card px-4 py-3">
                <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 px-4 py-2.5 text-[11.5px]">
            <span><span className="font-semibold tabular-nums">{summary.newCount}</span> <span className="text-muted-foreground">new</span></span>
            <span><span className="font-semibold tabular-nums">{summary.contacted}</span> <span className="text-muted-foreground">contacted</span></span>
            <span><span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{summary.won}</span> <span className="text-muted-foreground">won</span></span>
            <span><span className="font-semibold tabular-nums text-red-700 dark:text-red-400">{summary.lost}</span> <span className="text-muted-foreground">lost</span></span>
            {summary.pipelineValue !== null && summary.pipelineValue > 0 && (
              <span className="ml-auto text-muted-foreground">
                Est. pipeline <span className="font-semibold tabular-nums text-foreground">{formatMoney(summary.pipelineValue)}</span>
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
