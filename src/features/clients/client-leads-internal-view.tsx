"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ChevronLeft, Plus, Users } from "lucide-react";
import type { ClientLeadRow } from "@/server/queries/client-leads";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { FinancialAmount } from "@/components/shared/financial-amount";
import { Button } from "@/components/ui/button";
import { ClientLeadStatusBadge } from "@/features/portal/client-lead-status-badge";
import { ClientLeadManualFormDialog } from "@/features/leads/client-lead-manual-form-dialog";

/**
 * Internal, staff-facing view of one client's leads — replaces the old
 * `/leads?client=X` filtered view now that client leads live in their own
 * table. Read-focused: status/assignment/notes stay client-portal-managed
 * (client_member+); staff can view and manually log a lead here. See
 * FUTURE.md if internal edit parity turns out to be needed.
 */
export function ClientLeadsInternalView({ client, leads }: { client: { id: string; name: string }; leads: ClientLeadRow[] }) {
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div>
      <Link href={`/clients/${client.id}`} className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3.5" /> {client.name}
      </Link>
      <PageHeader title={`Leads for ${client.name}`} description="Leads generated for this client's own website or ads — managed by the client through their portal.">
        <Button size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
          <Plus className="size-3.5" /> Add Client Lead
        </Button>
      </PageHeader>

      {leads.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No leads yet"
          description="Add one manually, or leads generated for this client will appear here automatically."
          action={<Button size="sm" onClick={() => setFormOpen(true)}><Plus className="size-3.5" /> Add Client Lead</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          {leads.map((l) => (
            <div key={l.id} className="flex items-center gap-3 border-t border-border/40 px-4 py-3 first:border-t-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold">{l.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[l.email, l.phone].filter(Boolean).join(" · ") || "No contact info"} · {format(new Date(l.receivedAt), "MMM d, yyyy")}
                </p>
              </div>
              {l.estimatedValue && <FinancialAmount value={l.estimatedValue} className="text-[12px]" />}
              <ClientLeadStatusBadge status={l.status} />
            </div>
          ))}
        </div>
      )}

      <ClientLeadManualFormDialog open={formOpen} onOpenChange={setFormOpen} clients={[client]} fixedClientId={client.id} />
    </div>
  );
}
