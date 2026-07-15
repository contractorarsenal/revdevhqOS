import { requireWorkspace } from "@/lib/auth/session";
import { timed } from "@/lib/dev/timing";
import { listServices, listSubscriptions, listInvoices, listPayments } from "@/server/queries/billing";
import { listClients } from "@/server/queries/clients";
import { getDashboardMetrics } from "@/server/queries/metrics";
import { BillingView } from "@/features/billing/billing-view";

// Date-sensitive: days remaining, pace, and due states must be computed at
// request time in the workspace timezone — time moves even when no mutation
// fires a revalidation, so this page must never be statically frozen.
export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; new?: string; open?: string }>;
}) {
  const ctx = await requireWorkspace();
  const [services, subscriptions, invoices, payments, clients, metrics] = await timed("billing queries", () => Promise.all([
    listServices(ctx.workspace.id, true),
    listSubscriptions(ctx.workspace.id),
    listInvoices(ctx.workspace.id),
    listPayments(ctx.workspace.id),
    listClients(ctx.workspace.id),
    getDashboardMetrics(ctx.workspace.id, ctx.workspace.timezone),
  ]));
  const params = await searchParams;
  return (
    <BillingView
      services={services}
      subscriptions={subscriptions}
      invoices={invoices}
      payments={payments}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      metrics={metrics}
      initialTab={params.tab}
      openNew={params.new === "1"}
      highlightInvoiceId={params.open}
    />
  );
}
