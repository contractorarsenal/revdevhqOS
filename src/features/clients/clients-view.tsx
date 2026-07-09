"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { Users, Plus, Trash2, RotateCcw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { type ClientRow } from "@/server/queries/clients";
import { archiveClient, restoreClient } from "@/server/actions/clients";
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
import { ClientFormDialog, type MemberOption } from "./client-form-dialog";
import { formatMoney } from "@/lib/finance/metrics";
import { cn } from "@/lib/utils";

const TABS = ["all", "active", "onboarding", "past_due", "paused", "canceled", "archived"] as const;

export function ClientsView({
  clients, members, openNew,
}: { clients: ClientRow[]; members: MemberOption[] & { email?: string }[]; openNew: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [formOpen, setFormOpen] = useState(openNew);
  const [preview, setPreview] = useState<ClientRow | null>(null);
  // Optimistic removal: rows disappear the moment removal is confirmed and
  // reappear only if the server rejects it.
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set());

  const filtered = useMemo(() => {
    const visible = clients.filter((c) => !removedIds.has(c.id));
    return tab === "all" ? visible.filter((c) => c.status !== "archived") : visible.filter((c) => c.status === tab);
  }, [clients, tab, removedIds]);

  async function removeClient(client: ClientRow) {
    setRemovedIds((prev) => new Set([...prev, client.id]));
    const result = await archiveClient(client.id);
    if (!result.ok) {
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.delete(client.id);
        return next;
      });
      toast.error(result.error ?? "Could not remove the client.");
      return;
    }
    toast.success("Client removed.");
    router.refresh();
  }
  const totalMrr = clients.reduce((sum, c) => sum + c.mrr, 0);
  const activeCount = clients.filter((c) => ["active", "onboarding", "past_due"].includes(c.status)).length;
  const pastDueClients = clients.filter((c) => c.pastDueBalance > 0).length;

  const columns: ColumnDef<ClientRow>[] = [
    {
      accessorKey: "name",
      header: sortableHeader("Client"),
      cell: ({ row }) => (
        <span className="flex items-center gap-2.5">
          <ClientAvatar name={row.original.name} />
          <span>
            <span className="block font-semibold">{row.original.name}</span>
            <span className="block text-[11px] text-muted-foreground">{row.original.industry ?? "—"}</span>
          </span>
        </span>
      ),
    },
    {
      id: "contact",
      header: "Primary contact",
      cell: ({ row }) =>
        row.original.primaryContact ? (
          <span>
            <span className="block font-medium">{row.original.primaryContact.name}</span>
            <span className="block text-[11px] text-muted-foreground">{row.original.primaryContact.email ?? ""}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "serviceCount",
      header: "Services",
      cell: ({ row }) => <span className="tabular-nums">{row.original.serviceCount}</span>,
    },
    {
      accessorKey: "mrr",
      header: sortableHeader("MRR"),
      cell: ({ row }) => <FinancialAmount value={row.original.mrr} suffix="/mo" />,
    },
    {
      id: "billing",
      header: "Billing",
      cell: ({ row }) =>
        row.original.pastDueBalance > 0 ? (
          <StatusBadge status="past_due" />
        ) : (
          <StatusBadge status="paid" tone="green" />
        ),
    },
    {
      accessorKey: "status",
      header: sortableHeader("Status"),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "ownerName",
      header: "Owner",
      cell: ({ row }) => row.original.ownerName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
            <Link href={`/clients/${row.original.id}`}>Open</Link>
          </Button>
          {row.original.status !== "archived" ? (
            <ConfirmationDialog
              trigger={
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" title="Remove client">
                  <Trash2 className="size-3.5" />
                </Button>
              }
              title="Remove this client?"
              description={`Are you sure you want to remove ${row.original.name}? This will remove them from your active client list. Invoices, payments, and tasks are kept, and the client can be restored from the Archived tab.`}
              confirmLabel="Remove client"
              destructive
              onConfirm={() => removeClient(row.original)}
            />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={async () => {
                const result = await restoreClient(row.original.id);
                if (!result.ok) toast.error(result.error);
                else {
                  toast.success("Client restored");
                  router.refresh();
                }
              }}
            >
              <RotateCcw className="size-3.5" /> Restore
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Clients" description="Manage client relationships, services, billing, and account health.">
        <Button size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
          <Plus className="size-3.5" /> Add Client
        </Button>
      </PageHeader>

      <MetricGrid>
        <MetricCard label="Active clients" value={activeCount} hint="incl. onboarding" />
        <MetricCard label="Total client MRR" value={formatMoney(totalMrr)} hint="from active subscriptions" />
        <MetricCard label="Average client value" value={formatMoney(activeCount ? totalMrr / activeCount : 0)} hint="MRR / active client" />
        <MetricCard label="Past-due clients" value={pastDueClients} hint="with overdue balances" />
      </MetricGrid>

      <div className="mb-3 flex gap-0.5 overflow-x-auto border-b border-border">
        {TABS.map((t) => {
          const count = t === "all" ? clients.filter((c) => c.status !== "archived").length : clients.filter((c) => c.status === t).length;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 border-transparent px-2.5 py-2 text-[12.5px] font-medium capitalize text-muted-foreground hover:text-foreground",
                tab === t && "border-primary font-semibold text-foreground"
              )}
            >
              {t.replace("_", " ")} <span className="ml-1 rounded-full bg-muted px-1.5 text-[10.5px] tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Add your first client to start tracking services, billing, and work."
          action={
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="size-3.5" /> Add Client
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          searchPlaceholder="Search clients…"
          onRowClick={(row) => setPreview(row)}
          emptyMessage="No clients match this filter."
        />
      )}

      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} members={members} />

      <DetailDrawer
        open={Boolean(preview)}
        onOpenChange={(o) => !o && setPreview(null)}
        title={
          preview && (
            <span className="flex items-center gap-2.5">
              <ClientAvatar name={preview.name} className="size-8 text-xs" /> {preview.name}
            </span>
          )
        }
        description={preview?.industry ?? undefined}
        footer={
          preview && (
            <Button asChild size="sm" className="gap-1.5">
              <Link href={`/clients/${preview.id}`}>
                View full client <ExternalLink className="size-3.5" />
              </Link>
            </Button>
          )
        }
      >
        {preview && (
          <dl className="grid grid-cols-[130px_1fr] gap-y-2.5 text-[12.5px]">
            <dt className="text-muted-foreground">Status</dt>
            <dd><StatusBadge status={preview.status} /></dd>
            <dt className="text-muted-foreground">MRR</dt>
            <dd><FinancialAmount value={preview.mrr} suffix="/mo" /></dd>
            <dt className="text-muted-foreground">Past-due balance</dt>
            <dd>
              <FinancialAmount value={preview.pastDueBalance} className={preview.pastDueBalance > 0 ? "text-destructive" : undefined} />
            </dd>
            <dt className="text-muted-foreground">Owner</dt>
            <dd>{preview.ownerName ?? "—"}</dd>
            <dt className="text-muted-foreground">Primary contact</dt>
            <dd>
              {preview.primaryContact ? (
                <>
                  {preview.primaryContact.name}
                  <span className="block text-[11px] text-muted-foreground">{preview.primaryContact.email}</span>
                </>
              ) : ("—")}
            </dd>
            <dt className="text-muted-foreground">Active services</dt>
            <dd className="tabular-nums">{preview.serviceCount}</dd>
            <dt className="text-muted-foreground">Client since</dt>
            <dd>{preview.startDate ?? "—"}</dd>
          </dl>
        )}
      </DetailDrawer>
    </div>
  );
}
