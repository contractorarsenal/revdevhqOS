"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { Phone, MessageSquare, Mail, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { formatMoney, toAmount } from "@/lib/finance/metrics";
import { cn } from "@/lib/utils";
import {
  CLIENT_LEAD_STATUSES, CLIENT_LEAD_STATUS_LABEL,
  isNeedsResponse, isOverdue24h, telHref, smsHref, mailtoHref, type ClientLeadStatus,
} from "@/lib/leads-client";
import type { ClientLeadRow, EligibleAssignee } from "@/server/queries/client-leads";
import { updateClientLeadStatus } from "@/server/actions/client-leads";
import { ClientLeadStatusBadge } from "./client-lead-status-badge";
import { ClientLeadDetail } from "./client-lead-detail";

type SortKey = "newest" | "oldest" | "highest_value";

export function ClientLeadsView({
  leads: initialLeads, assignees, canManage,
}: {
  leads: ClientLeadRow[];
  assignees: EligibleAssignee[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"list" | "board">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClientLeadStatus | "all">("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [statusOverrides, setStatusOverrides] = useState<Record<string, ClientLeadStatus>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const leads = useMemo(
    () => initialLeads.map((l) => (statusOverrides[l.id] ? { ...l, status: statusOverrides[l.id] } : l)),
    [initialLeads, statusOverrides]
  );

  const sources = useMemo(() => [...new Set(leads.map((l) => l.source).filter((s): s is string => Boolean(s)))], [leads]);

  const filtered = useMemo(() => {
    let result = leads;
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      result = result.filter(
        (l) => (l.name ?? "").toLowerCase().includes(term) || (l.email ?? "").toLowerCase().includes(term) || (l.phone ?? "").includes(term)
      );
    }
    if (statusFilter !== "all") result = result.filter((l) => l.status === statusFilter);
    if (assigneeFilter !== "all") {
      result = assigneeFilter === "unassigned" ? result.filter((l) => !l.assignedToId) : result.filter((l) => l.assignedToId === assigneeFilter);
    }
    if (sourceFilter !== "all") result = result.filter((l) => l.source === sourceFilter);
    return [...result].sort((a, b) => {
      if (sort === "oldest") return +new Date(a.receivedAt) - +new Date(b.receivedAt);
      if (sort === "highest_value") return toAmount(b.estimatedValue) - toAmount(a.estimatedValue);
      return +new Date(b.receivedAt) - +new Date(a.receivedAt);
    });
  }, [leads, search, statusFilter, assigneeFilter, sourceFilter, sort]);

  const selected = leads.find((l) => l.id === selectedId) ?? null;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function onDragEnd(event: DragEndEvent) {
    const leadId = String(event.active.id);
    const status = event.over ? (String(event.over.id) as ClientLeadStatus) : null;
    if (!status) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === status) return;
    setStatusOverrides((prev) => ({ ...prev, [leadId]: status }));
    const result = await updateClientLeadStatus(leadId, { status });
    if (!result.ok) {
      setStatusOverrides((prev) => ({ ...prev, [leadId]: lead.status as ClientLeadStatus }));
      toast.error(result.error ?? "Could not update status");
      return;
    }
    toast.success(`Moved to ${CLIENT_LEAD_STATUS_LABEL[status]}`);
    router.refresh();
  }

  return (
    <div>
      <PageHeader title="Leads" description="Every lead Contractor Arsenal has generated for you.">
        <div className="flex rounded-md bg-muted p-0.5">
          {(["list", "board"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn("rounded px-3 py-1 text-xs font-semibold capitalize", view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
            >
              {v}
            </button>
          ))}
        </div>
      </PageHeader>

      {initialLeads.length === 0 ? (
        <EmptyState icon={Users} title="No leads yet" description="New leads Contractor Arsenal generates for you will show up here." />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, phone…"
                className="h-8 w-56 pl-8 text-xs"
              />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ClientLeadStatus | "all")} className="h-8 rounded-md border border-input bg-transparent px-2 text-xs">
              <option value="all">All statuses</option>
              {CLIENT_LEAD_STATUSES.map((s) => <option key={s} value={s}>{CLIENT_LEAD_STATUS_LABEL[s]}</option>)}
            </select>
            <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-xs">
              <option value="all">Anyone assigned</option>
              <option value="unassigned">Unassigned</option>
              {assignees.map((a) => <option key={a.profileId} value={a.profileId}>{a.name}</option>)}
            </select>
            {sources.length > 0 && (
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-xs">
                <option value="all">All sources</option>
                {sources.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="ml-auto h-8 rounded-md border border-input bg-transparent px-2 text-xs">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="highest_value">Highest Estimated Value</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-8 text-center text-[12.5px] text-muted-foreground">No leads match your filters.</p>
          ) : view === "list" ? (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((lead) => (
                <LeadCard key={lead.id} lead={lead} onOpen={() => setSelectedId(lead.id)} />
              ))}
            </div>
          ) : (
            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {CLIENT_LEAD_STATUSES.map((status) => (
                  <BoardColumn key={status} status={status} leads={filtered.filter((l) => l.status === status)} onOpen={setSelectedId} />
                ))}
              </div>
            </DndContext>
          )}
        </>
      )}

      <ClientLeadDetail
        lead={selected}
        assignees={assignees}
        canManage={canManage}
        open={Boolean(selectedId)}
        onOpenChange={(o) => !o && setSelectedId(null)}
      />
    </div>
  );
}

function QuickActions({ lead }: { lead: ClientLeadRow }) {
  const tel = telHref(lead.phone);
  const sms = smsHref(lead.phone);
  const mailto = mailtoHref(lead.email);
  return (
    <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
      {tel && (
        <a href={tel} className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground" aria-label="Call">
          <Phone className="size-3.5" />
        </a>
      )}
      {sms && (
        <a href={sms} className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground" aria-label="Text">
          <MessageSquare className="size-3.5" />
        </a>
      )}
      {mailto && (
        <a href={mailto} className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground" aria-label="Email">
          <Mail className="size-3.5" />
        </a>
      )}
    </div>
  );
}

function LeadCard({ lead, onOpen, dragging }: { lead: ClientLeadRow; onOpen: () => void; dragging?: boolean }) {
  const needsResponse = isNeedsResponse({ status: lead.status, contactedAt: lead.contactedAt });
  const overdue = needsResponse && isOverdue24h(lead.receivedAt, new Date());

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={cn(
        "cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition-colors hover:border-muted-foreground/40",
        overdue ? "border-red-300 dark:border-red-900" : "border-border",
        dragging && "rotate-1 shadow-md"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{lead.name ?? "Unnamed lead"}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">{lead.requestedService ?? "—"}</p>
        </div>
        <ClientLeadStatusBadge status={lead.status as ClientLeadStatus} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span>{format(new Date(lead.receivedAt), "MMM d, h:mm a")}</span>
        {lead.source && <span>· {lead.source}</span>}
        {lead.assignedToName && <span>· {lead.assignedToName}</span>}
        {lead.estimatedValue && <span className="ml-auto font-semibold text-foreground">{formatMoney(lead.estimatedValue)}</span>}
      </div>
      {overdue && (
        <p className="mt-1.5 text-[11px] font-semibold text-red-700 dark:text-red-400">
          Waiting {formatDistanceToNow(new Date(lead.receivedAt))} — needs response
        </p>
      )}
      <QuickActions lead={lead} />
    </div>
  );
}

function DraggableLeadCard({ lead, onOpen }: { lead: ClientLeadRow; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1 } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <LeadCard lead={lead} onOpen={() => onOpen(lead.id)} />
    </div>
  );
}

function BoardColumn({
  status, leads, onOpen,
}: {
  status: ClientLeadStatus;
  leads: ClientLeadRow[];
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const totalValue = leads.reduce((sum, l) => sum + toAmount(l.estimatedValue), 0);
  return (
    <div ref={setNodeRef} className={cn("w-72 shrink-0 rounded-lg border bg-muted/30 p-2", isOver ? "border-primary" : "border-border")}>
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <ClientLeadStatusBadge status={status} />
          <span className="text-[11px] text-muted-foreground">{leads.length}</span>
        </div>
        {totalValue > 0 && <span className="text-[11px] font-semibold text-muted-foreground">{formatMoney(totalValue)}</span>}
      </div>
      <div className="space-y-2">
        {leads.map((lead) => <DraggableLeadCard key={lead.id} lead={lead} onOpen={onOpen} />)}
        {leads.length === 0 && <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">No leads</p>}
      </div>
    </div>
  );
}
