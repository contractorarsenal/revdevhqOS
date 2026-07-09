"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Plus, CreditCard, FileText, DollarSign, Package, Pause, Play, XCircle, Archive, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard, MetricGrid } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { FinancialAmount } from "@/components/shared/financial-amount";
import { DataTable, sortableHeader } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney, invoiceBalance, isPastDue } from "@/lib/finance/metrics";
import { setSubscriptionStatus, setInvoiceStatus, markInvoicePaid, archiveService } from "@/server/actions/billing";
import { ServiceFormDialog } from "./service-form-dialog";
import { SubscriptionFormDialog } from "./subscription-form-dialog";
import { InvoiceFormDialog } from "./invoice-form-dialog";
import { PaymentFormDialog } from "./payment-form-dialog";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Metrics = {
  mrr: number; arr: number; collectedThisMonth: number; collectedToday: number;
  outstanding: number; pastDue: number;
};

export function BillingView({
  services, subscriptions, invoices, payments, clients, metrics, initialTab, openNew,
}: {
  services: any[]; subscriptions: any[]; invoices: any[]; payments: any[];
  clients: { id: string; name: string }[]; metrics: Metrics;
  initialTab?: string; openNew?: boolean;
}) {
  const router = useRouter();
  const validTabs = ["subscriptions", "invoices", "payments", "services"];
  const tab = validTabs.includes(initialTab ?? "") ? initialTab! : "subscriptions";
  const [serviceForm, setServiceForm] = useState(false);
  const [editService, setEditService] = useState<any>(null);
  const [subForm, setSubForm] = useState(Boolean(openNew) && tab === "subscriptions");
  const [invoiceForm, setInvoiceForm] = useState(Boolean(openNew) && tab === "invoices");
  const [paymentForm, setPaymentForm] = useState(Boolean(openNew) && tab === "payments");

  const suggestedNumber = `INV-${String(1000 + invoices.length + 1)}`;

  async function run(promise: Promise<{ ok: boolean; error?: string }>, success: string) {
    const result = await promise;
    if (!result.ok) toast.error(result.error ?? "Action failed");
    else {
      toast.success(success);
      router.refresh();
    }
  }

  const subCols: ColumnDef<any>[] = [
    { accessorKey: "clientName", header: sortableHeader("Client"), cell: ({ row }) => <span className="font-semibold">{row.original.clientName}</span> },
    { accessorKey: "serviceName", header: "Service" },
    { accessorKey: "amount", header: sortableHeader("Amount"), cell: ({ row }) => <FinancialAmount value={row.original.amount} suffix={`/${row.original.frequency.replace("_", "-").replace("ly", "")}`} /> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { accessorKey: "startDate", header: "Started" },
    { accessorKey: "nextBillingDate", header: "Next billing", cell: ({ row }) => row.original.nextBillingDate ?? <span className="text-muted-foreground">—</span> },
    {
      id: "actions", header: "",
      cell: ({ row }) => {
        const s = row.original;
        return (
          <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {s.status === "active" && (
              <Button variant="ghost" size="icon" className="size-7" title="Pause" onClick={() => run(setSubscriptionStatus(s.id, "paused"), "Subscription paused")}>
                <Pause className="size-3.5" />
              </Button>
            )}
            {s.status === "paused" && (
              <Button variant="ghost" size="icon" className="size-7" title="Resume" onClick={() => run(setSubscriptionStatus(s.id, "active"), "Subscription resumed")}>
                <Play className="size-3.5" />
              </Button>
            )}
            {!["canceled", "completed"].includes(s.status) && (
              <ConfirmationDialog
                trigger={<Button variant="ghost" size="icon" className="size-7 text-muted-foreground" title="Cancel"><XCircle className="size-3.5" /></Button>}
                title="Cancel this subscription?"
                description={`${s.serviceName} for ${s.clientName} stops counting toward MRR.`}
                confirmLabel="Cancel subscription"
                destructive
                onConfirm={() => run(setSubscriptionStatus(s.id, "canceled"), "Subscription canceled")}
              />
            )}
          </span>
        );
      },
    },
  ];

  const invCols: ColumnDef<any>[] = [
    { accessorKey: "number", header: sortableHeader("Invoice"), cell: ({ row }) => <span className="font-semibold">{row.original.number}</span> },
    { accessorKey: "clientName", header: "Client" },
    { accessorKey: "total", header: sortableHeader("Total"), cell: ({ row }) => <FinancialAmount value={row.original.total} /> },
    { id: "balance", header: "Balance", cell: ({ row }) => <FinancialAmount value={invoiceBalance(row.original)} className={invoiceBalance(row.original) > 0 ? "" : "text-muted-foreground"} /> },
    {
      id: "status", header: "Status",
      cell: ({ row }) => <StatusBadge status={isPastDue(row.original) ? "past_due" : row.original.status} />,
    },
    { accessorKey: "issueDate", header: "Issued", cell: ({ row }) => row.original.issueDate ?? "—" },
    { accessorKey: "dueDate", header: "Due", cell: ({ row }) => row.original.dueDate ?? "—" },
    {
      id: "actions", header: "",
      cell: ({ row }) => {
        const inv = row.original;
        return (
          <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {inv.status === "draft" && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => run(setInvoiceStatus(inv.id, "open"), "Invoice opened")}>
                Mark open
              </Button>
            )}
            {["open", "past_due"].includes(inv.status) && invoiceBalance(inv) > 0 && (
              <ConfirmationDialog
                trigger={<Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs"><CheckCircle2 className="size-3.5" /> Mark paid</Button>}
                title="Mark invoice paid?"
                description={`Records a payment of ${formatMoney(invoiceBalance(inv))} against ${inv.number}.`}
                confirmLabel="Record & mark paid"
                onConfirm={() => run(markInvoicePaid(inv.id), "Invoice paid")}
              />
            )}
            {inv.status !== "void" && inv.status !== "paid" && (
              <ConfirmationDialog
                trigger={<Button variant="ghost" size="icon" className="size-7 text-muted-foreground" title="Void"><XCircle className="size-3.5" /></Button>}
                title="Void this invoice?"
                description={`${inv.number} will no longer count toward outstanding revenue.`}
                confirmLabel="Void invoice"
                destructive
                onConfirm={() => run(setInvoiceStatus(inv.id, "void"), "Invoice voided")}
              />
            )}
          </span>
        );
      },
    },
  ];

  const payCols: ColumnDef<any>[] = [
    { accessorKey: "clientName", header: "Client", cell: ({ row }) => row.original.clientName ?? <span className="text-muted-foreground">—</span> },
    { accessorKey: "amount", header: sortableHeader("Amount"), cell: ({ row }) => <FinancialAmount value={row.original.amount} className="text-emerald-700 dark:text-emerald-400" /> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { accessorKey: "method", header: "Method", cell: ({ row }) => row.original.method ?? "—" },
    { accessorKey: "reference", header: "Reference", cell: ({ row }) => row.original.reference ?? "—" },
    { accessorKey: "paidAt", header: sortableHeader("Date"), cell: ({ row }) => new Date(row.original.paidAt).toLocaleDateString() },
  ];

  const svcCols: ColumnDef<any>[] = [
    { accessorKey: "name", header: sortableHeader("Service"), cell: ({ row }) => <span className="font-semibold">{row.original.name}</span> },
    { accessorKey: "description", header: "Description", cell: ({ row }) => <span className="text-muted-foreground">{row.original.description ?? "—"}</span> },
    { accessorKey: "defaultPrice", header: "Default price", cell: ({ row }) => (row.original.defaultPrice ? <FinancialAmount value={row.original.defaultPrice} suffix={`/${row.original.defaultFrequency.replace("_", "-").replace("ly", "")}`} /> : "—") },
    { id: "state", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.archivedAt ? "archived" : "active"} /> },
    {
      id: "actions", header: "",
      cell: ({ row }) => (
        <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setEditService(row.original); setServiceForm(true); }}>
            Edit
          </Button>
          {!row.original.archivedAt && (
            <ConfirmationDialog
              trigger={<Button variant="ghost" size="icon" className="size-7 text-muted-foreground" title="Archive"><Archive className="size-3.5" /></Button>}
              title="Archive this service?"
              description="Archived services cannot be added to new subscriptions."
              confirmLabel="Archive"
              destructive
              onConfirm={() => run(archiveService(row.original.id), "Service archived")}
            />
          )}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Billing" description="Monitor subscriptions, invoices, payments, and agency revenue.">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPaymentForm(true)}>
          <DollarSign className="size-3.5" /> Record Payment
        </Button>
        <Button size="sm" className="gap-1.5" onClick={() => setInvoiceForm(true)}>
          <Plus className="size-3.5" /> Create Invoice
        </Button>
      </PageHeader>

      <MetricGrid>
        <MetricCard label="MRR" value={formatMoney(metrics.mrr)} hint="from active subscriptions" />
        <MetricCard label="ARR" value={formatMoney(metrics.arr)} hint="MRR × 12" />
        <MetricCard label="Collected this month" value={formatMoney(metrics.collectedThisMonth)} hint={`today: ${formatMoney(metrics.collectedToday)}`} />
        <MetricCard label="Outstanding" value={formatMoney(metrics.outstanding)} hint="unpaid invoice balances" />
        <MetricCard label="Past-due" value={formatMoney(metrics.pastDue)} hint="past the due date" />
        <MetricCard label="Active subscriptions" value={subscriptions.filter((s) => s.status === "active").length} hint={`${services.filter((s) => !s.archivedAt).length} services`} />
      </MetricGrid>

      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
        </TabsList>

        <TabsContent value="subscriptions" className="mt-4">
          {subscriptions.length === 0 ? (
            <EmptyState icon={CreditCard} title="No subscriptions yet" description="Subscriptions define expected recurring billing and drive MRR."
              action={<Button size="sm" onClick={() => setSubForm(true)}><Plus className="size-3.5" /> New subscription</Button>} />
          ) : (
            <DataTable columns={subCols} data={subscriptions} searchPlaceholder="Search subscriptions…"
              toolbar={<Button size="sm" variant="outline" className="ml-auto gap-1" onClick={() => setSubForm(true)}><Plus className="size-3.5" /> New subscription</Button>} />
          )}
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          {invoices.length === 0 ? (
            <EmptyState icon={FileText} title="No invoices yet" description="Invoices are amounts requested from clients."
              action={<Button size="sm" onClick={() => setInvoiceForm(true)}><Plus className="size-3.5" /> Create invoice</Button>} />
          ) : (
            <DataTable columns={invCols} data={invoices} searchPlaceholder="Search invoices…"
              toolbar={<Button size="sm" variant="outline" className="ml-auto gap-1" onClick={() => setInvoiceForm(true)}><Plus className="size-3.5" /> Create invoice</Button>} />
          )}
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          {payments.length === 0 ? (
            <EmptyState icon={DollarSign} title="No payments recorded" description="Payments are money actually collected — they power the revenue metrics."
              action={<Button size="sm" onClick={() => setPaymentForm(true)}><Plus className="size-3.5" /> Record payment</Button>} />
          ) : (
            <DataTable columns={payCols} data={payments} searchPlaceholder="Search payments…"
              toolbar={<Button size="sm" variant="outline" className="ml-auto gap-1" onClick={() => setPaymentForm(true)}><Plus className="size-3.5" /> Record payment</Button>} />
          )}
        </TabsContent>

        <TabsContent value="services" className="mt-4">
          {services.length === 0 ? (
            <EmptyState icon={Package} title="No services yet" description="Define what your agency sells — Google Ads, SEO, web design…"
              action={<Button size="sm" onClick={() => { setEditService(null); setServiceForm(true); }}><Plus className="size-3.5" /> Add service</Button>} />
          ) : (
            <DataTable columns={svcCols} data={services} searchPlaceholder="Search services…"
              toolbar={<Button size="sm" variant="outline" className="ml-auto gap-1" onClick={() => { setEditService(null); setServiceForm(true); }}><Plus className="size-3.5" /> Add service</Button>} />
          )}
        </TabsContent>
      </Tabs>

      <ServiceFormDialog open={serviceForm} onOpenChange={setServiceForm} service={editService} />
      <SubscriptionFormDialog open={subForm} onOpenChange={setSubForm} clients={clients} services={services.filter((s) => !s.archivedAt)} />
      <InvoiceFormDialog open={invoiceForm} onOpenChange={setInvoiceForm} clients={clients} suggestedNumber={suggestedNumber} />
      <PaymentFormDialog open={paymentForm} onOpenChange={setPaymentForm} clients={clients} invoices={invoices} />
    </div>
  );
}
