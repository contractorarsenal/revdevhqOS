"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { format, isPast } from "date-fns";
import { Target, Plus, ArrowRight, XCircle, Pencil, PhoneCall } from "lucide-react";
import { type LeadRow } from "@/server/queries/leads";
import { convertLeadToOpportunity, markLeadLost, touchLeadContact } from "@/server/actions/leads";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard, MetricGrid } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClientAvatar } from "@/components/shared/client-avatar";
import { FinancialAmount } from "@/components/shared/financial-amount";
import { DataTable, sortableHeader } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { DetailDrawer } from "@/components/shared/detail-drawer";
import { Button } from "@/components/ui/button";
import { formatMoney, toAmount } from "@/lib/finance/metrics";
import { LeadFormDialog } from "./lead-form-dialog";

export function LeadsView({
  leads, members, clients, openNew,
}: { leads: LeadRow[]; members: { userId: string; name: string }[]; clients: { id: string; name: string }[]; openNew: boolean }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(openNew);
  const [editing, setEditing] = useState<LeadRow | null>(null);
  const [drawer, setDrawer] = useState<LeadRow | null>(null);

  const openLeads = useMemo(() => leads.filter((l) => !["converted", "lost", "unqualified"].includes(l.status)), [leads]);
  const potentialMrr = openLeads.reduce((sum, l) => sum + toAmount(l.estimatedMrr), 0);
  const needFollowUp = openLeads.filter((l) => l.nextFollowUpAt && isPast(new Date(l.nextFollowUpAt))).length;
  const converted = leads.filter((l) => l.status === "converted").length;

  async function run(promise: Promise<{ ok: boolean; error?: string }>, success: string) {
    const result = await promise;
    if (!result.ok) toast.error(result.error ?? "Action failed");
    else {
      toast.success(success);
      setDrawer(null);
      router.refresh();
    }
  }

  const columns: ColumnDef<LeadRow>[] = [
    {
      accessorKey: "company",
      header: sortableHeader("Company"),
      cell: ({ row }) => (
        <span className="flex items-center gap-2.5">
          <ClientAvatar name={row.original.company} />
          <span>
            <span className="block font-semibold">{row.original.company}</span>
            <span className="block text-[11px] text-muted-foreground">{row.original.source ?? "—"}</span>
          </span>
        </span>
      ),
    },
    {
      id: "contact", header: "Contact",
      cell: ({ row }) => (
        <span>
          <span className="block font-medium">{row.original.contactName ?? "—"}</span>
          <span className="block text-[11px] text-muted-foreground">{row.original.email ?? ""}</span>
        </span>
      ),
    },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      accessorKey: "estimatedMrr", header: sortableHeader("Est. MRR"),
      cell: ({ row }) => (row.original.estimatedMrr ? <FinancialAmount value={row.original.estimatedMrr} suffix="/mo" /> : <span className="text-muted-foreground">—</span>),
    },
    {
      accessorKey: "estimatedValue", header: "One-time",
      cell: ({ row }) => (row.original.estimatedValue ? <FinancialAmount value={row.original.estimatedValue} /> : <span className="text-muted-foreground">—</span>),
    },
    { accessorKey: "serviceInterest", header: "Interest", cell: ({ row }) => row.original.serviceInterest ?? <span className="text-muted-foreground">—</span> },
    { accessorKey: "ownerName", header: "Owner", cell: ({ row }) => row.original.ownerName ?? <span className="text-muted-foreground">—</span> },
    {
      accessorKey: "nextFollowUpAt", header: sortableHeader("Follow-up"),
      cell: ({ row }) => {
        const d = row.original.nextFollowUpAt;
        if (!d) return <span className="text-muted-foreground">—</span>;
        const overdue = isPast(new Date(d)) && !["converted", "lost"].includes(row.original.status);
        return (
          <span className={overdue ? "font-semibold text-red-700 dark:text-red-400" : ""}>
            {format(new Date(d), "MMM d")}{overdue ? " · overdue" : ""}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Leads" description="Track potential clients, communication, and upcoming follow-ups.">
        <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="size-3.5" /> Add Lead
        </Button>
      </PageHeader>

      <MetricGrid>
        <MetricCard label="Open leads" value={openLeads.length} hint={`${leads.length} total`} />
        <MetricCard label="Need follow-up" value={needFollowUp} hint="follow-up date passed" />
        <MetricCard label="Qualified" value={leads.filter((l) => l.status === "qualified").length} hint="ready for pipeline" />
        <MetricCard label="Potential MRR" value={formatMoney(potentialMrr)} hint="across open leads" />
        <MetricCard label="Converted" value={converted} hint="became clients or deals" />
      </MetricGrid>

      {leads.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No leads yet"
          description="Add prospects here, then convert them into pipeline opportunities."
          action={<Button size="sm" onClick={() => setFormOpen(true)}><Plus className="size-3.5" /> Add Lead</Button>}
        />
      ) : (
        <DataTable columns={columns} data={leads} searchPlaceholder="Search leads…" onRowClick={(row) => setDrawer(row)} />
      )}

      <LeadFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        members={members}
        clients={clients}
        lead={
          editing
            ? {
                id: editing.id, company: editing.company, contactName: editing.contactName ?? "",
                email: editing.email ?? "", phone: editing.phone ?? "", source: editing.source ?? "",
                status: editing.status === "converted" ? "qualified" : editing.status,
                serviceInterest: editing.serviceInterest ?? "",
                estimatedValue: editing.estimatedValue ?? "", estimatedMrr: editing.estimatedMrr ?? "",
                ownerId: editing.ownerId ?? "", notes: editing.notes ?? "",
                nextFollowUpValue: editing.nextFollowUpAt ? new Date(editing.nextFollowUpAt).toISOString().slice(0, 10) : "",
              }
            : null
        }
      />

      <DetailDrawer
        open={Boolean(drawer)}
        onOpenChange={(o) => !o && setDrawer(null)}
        title={drawer && (
          <span className="flex items-center gap-2.5">
            <ClientAvatar name={drawer.company} className="size-8 text-xs" /> {drawer.company}
          </span>
        )}
        description={drawer?.source ? `Source: ${drawer.source}` : undefined}
        footer={
          drawer && !["converted", "lost"].includes(drawer.status) ? (
            <>
              <Button size="sm" className="gap-1.5" onClick={() => run(convertLeadToOpportunity(drawer.id), "Opportunity created in the pipeline")}>
                Convert to opportunity <ArrowRight className="size-3.5" />
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => run(touchLeadContact(drawer.id), "Contact logged")}>
                <PhoneCall className="size-3.5" /> Log contact
              </Button>
              <ConfirmationDialog
                trigger={<Button size="sm" variant="outline" className="gap-1.5 text-destructive"><XCircle className="size-3.5" /> Mark lost</Button>}
                title="Mark this lead lost?"
                description={`${drawer.company} will be moved to lost.`}
                confirmLabel="Mark lost"
                destructive
                onConfirm={() => run(markLeadLost(drawer.id), "Lead marked lost")}
              />
            </>
          ) : (
            drawer && <StatusBadge status={drawer.status} />
          )
        }
      >
        {drawer && (
          <>
            <dl className="grid grid-cols-[130px_1fr] gap-y-2.5 text-[12.5px]">
              <dt className="text-muted-foreground">Status</dt><dd><StatusBadge status={drawer.status} /></dd>
              <dt className="text-muted-foreground">Contact</dt>
              <dd>{drawer.contactName ?? "—"}<span className="block text-[11px] text-muted-foreground">{[drawer.email, drawer.phone].filter(Boolean).join(" · ")}</span></dd>
              <dt className="text-muted-foreground">Est. MRR</dt><dd>{drawer.estimatedMrr ? <FinancialAmount value={drawer.estimatedMrr} suffix="/mo" /> : "—"}</dd>
              <dt className="text-muted-foreground">One-time value</dt><dd>{drawer.estimatedValue ? <FinancialAmount value={drawer.estimatedValue} /> : "—"}</dd>
              <dt className="text-muted-foreground">Service interest</dt><dd>{drawer.serviceInterest ?? "—"}</dd>
              <dt className="text-muted-foreground">Owner</dt><dd>{drawer.ownerName ?? "—"}</dd>
              <dt className="text-muted-foreground">Last contacted</dt><dd>{drawer.lastContactedAt ? format(new Date(drawer.lastContactedAt), "MMM d, yyyy") : "Never"}</dd>
              <dt className="text-muted-foreground">Next follow-up</dt><dd>{drawer.nextFollowUpAt ? format(new Date(drawer.nextFollowUpAt), "MMM d, yyyy") : "—"}</dd>
            </dl>
            {drawer.notes && (
              <div>
                <h4 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</h4>
                <p className="whitespace-pre-wrap text-[12.5px] text-muted-foreground">{drawer.notes}</p>
              </div>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setEditing(drawer); setDrawer(null); setFormOpen(true); }}>
              <Pencil className="size-3.5" /> Edit lead
            </Button>
          </>
        )}
      </DetailDrawer>
    </div>
  );
}
