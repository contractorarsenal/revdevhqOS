import { format } from "date-fns";
import { CreditCard } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatMoney, invoiceBalance } from "@/lib/finance/metrics";
import type { getPortalBilling } from "@/server/queries/portal-data";
import { EmptyLine, Panel, PortalHeading, Stat } from "./portal-ui";

type Billing = Awaited<ReturnType<typeof getPortalBilling>>;
const FREQ: Record<string, string> = { one_time: "one-time", weekly: "week", monthly: "month", quarterly: "quarter", yearly: "year" };

export function PortalBillingView({ billing }: { billing: Billing }) {
  const nothing = billing.subscriptions.length === 0 && billing.invoices.length === 0 && billing.payments.length === 0;
  return (
    <div>
      <PortalHeading title="Billing" description="Your services, invoices, and payment history." />
      {nothing ? (
        <EmptyState icon={CreditCard} title="No billing activity yet" description="Your services and payments will appear here." />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Outstanding" value={formatMoney(billing.outstanding)} tone={billing.pastDue > 0 ? "bad" : undefined} />
            <Stat label="Past due" value={formatMoney(billing.pastDue)} tone={billing.pastDue > 0 ? "bad" : undefined} />
            <Stat label="Paid to date" value={formatMoney(billing.paidTotal)} />
            <Stat label="Active services" value={billing.subscriptions.filter((s) => s.status === "active").length} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Services" flush>
              {billing.subscriptions.length === 0 ? <EmptyLine>No services on file.</EmptyLine> : (
                <ul>
                  {billing.subscriptions.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold">{s.serviceName}</p>
                        <p className="text-[11.5px] text-muted-foreground">{formatMoney(s.amount)} / {FREQ[s.frequency] ?? s.frequency}</p>
                      </div>
                      <StatusBadge status={s.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Invoices" flush>
              {billing.invoices.length === 0 ? <EmptyLine>No invoices.</EmptyLine> : (
                <ul>
                  {billing.invoices.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold">{i.number}</p>
                        <p className="text-[11.5px] text-muted-foreground">{i.dueDate ? `Due ${format(new Date(`${i.dueDate}T12:00:00`), "MMM d, yyyy")}` : "No due date"}</p>
                      </div>
                      <div className="text-right">
                        <p className="tabular-nums text-[13px] font-semibold">{formatMoney(i.total)}</p>
                        {invoiceBalance(i) > 0 && <p className="tabular-nums text-[11px] text-muted-foreground">{formatMoney(invoiceBalance(i))} due</p>}
                      </div>
                      <StatusBadge status={i.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel title="Payment history" className="mt-4" flush>
            {billing.payments.length === 0 ? <EmptyLine>No payments recorded yet.</EmptyLine> : (
              <ul>
                {billing.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 border-t border-border px-4 py-2.5 first:border-t-0">
                    <span className="w-24 shrink-0 text-[12px] text-muted-foreground">{format(new Date(p.paidAt), "MMM d, yyyy")}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] capitalize">{p.method ?? "Payment"}</span>
                    <span className="tabular-nums text-[13px] font-semibold">{formatMoney(p.amount)}</span>
                    <StatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
