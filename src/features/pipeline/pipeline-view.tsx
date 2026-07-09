"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { format } from "date-fns";
import { Kanban, Plus, Trophy, XCircle, Pencil } from "lucide-react";
import { type StageWithOpps } from "@/server/queries/pipeline";
import { moveOpportunity, markOpportunityOutcome } from "@/server/actions/pipeline";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard, MetricGrid } from "@/components/shared/metric-card";
import { ClientAvatar } from "@/components/shared/client-avatar";
import { StatusBadge } from "@/components/shared/status-badge";
import { DetailDrawer } from "@/components/shared/detail-drawer";
import { FinancialAmount } from "@/components/shared/financial-amount";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { formatMoney, toAmount } from "@/lib/finance/metrics";
import { cn } from "@/lib/utils";
import { OpportunityFormDialog } from "./opportunity-form-dialog";
import { ConvertDialog } from "./convert-dialog";

type Opp = StageWithOpps["opportunities"][number];

function OppCard({ opp, onOpen, dragging }: { opp: Opp; onOpen?: (o: Opp) => void; dragging?: boolean }) {
  return (
    <button
      onClick={() => onOpen?.(opp)}
      className={cn(
        "w-full rounded-lg border border-border bg-card p-2.5 text-left shadow-sm transition-colors hover:border-muted-foreground/40",
        dragging && "rotate-1 shadow-md"
      )}
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{opp.name}</p>
        {opp.ownerName && <ClientAvatar name={opp.ownerName} className="size-5 rounded-full text-[9px]" />}
      </div>
      {opp.contactName && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{opp.contactName}</p>}
      <div className="mt-1.5 flex items-baseline gap-2 text-[11.5px]">
        <FinancialAmount value={opp.value} />
        {toAmount(opp.mrr) > 0 && (
          <span className="text-muted-foreground">
            <FinancialAmount value={opp.mrr} className="font-medium" suffix="/mo" />
          </span>
        )}
      </div>
      {opp.expectedCloseDate && (
        <p className="mt-1 text-[10.5px] text-muted-foreground">Close {format(new Date(opp.expectedCloseDate), "MMM d")}</p>
      )}
    </button>
  );
}

function DraggableCard({ opp, onOpen }: { opp: Opp; onOpen: (o: Opp) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: opp.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn("touch-none", isDragging && "opacity-30")}>
      <OppCard opp={opp} onOpen={onOpen} />
    </div>
  );
}

function StageColumn({
  stage, onOpen,
}: { stage: StageWithOpps; onOpen: (o: Opp) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = stage.opportunities.reduce((sum, o) => sum + toAmount(o.value), 0);
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[248px] shrink-0 flex-col rounded-lg border border-border/60 bg-muted/40 dark:bg-muted/20",
        isOver && "outline-2 outline-dashed outline-primary"
      )}
    >
      <div className="px-3 pb-1.5 pt-2.5">
        <div className="flex items-center gap-1.5">
          <span className={cn("text-xs font-semibold", stage.isWon && "text-emerald-700 dark:text-emerald-400", stage.isLost && "text-red-700 dark:text-red-400")}>
            {stage.name}
          </span>
          <span className="rounded-full border border-border bg-card px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {stage.opportunities.length}
          </span>
          <span className="ml-auto text-[10.5px] font-semibold text-muted-foreground/70 tabular-nums">{stage.probability}%</span>
        </div>
        <p className="mt-0.5 text-[10.5px] tabular-nums text-muted-foreground">{formatMoney(total)} value</p>
      </div>
      <div className="flex min-h-[60px] flex-col gap-1.5 px-2 pb-2">
        {stage.opportunities.map((opp) => (
          <DraggableCard key={opp.id} opp={opp} onOpen={onOpen} />
        ))}
        {stage.opportunities.length === 0 && (
          <p className="py-3 text-center text-[10.5px] text-muted-foreground/60">Drop deals here</p>
        )}
      </div>
    </div>
  );
}

export function PipelineView({
  stages, members, services, leads, openNew,
}: {
  stages: StageWithOpps[];
  members: { userId: string; name: string }[];
  services: { id: string; name: string; defaultPrice: string | null; defaultFrequency: string }[];
  leads: { id: string; company: string }[];
  openNew: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(openNew);
  const [editing, setEditing] = useState<Opp | null>(null);
  const [drawer, setDrawer] = useState<Opp | null>(null);
  const [convertTarget, setConvertTarget] = useState<Opp | null>(null);
  const [activeDrag, setActiveDrag] = useState<Opp | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const allOpps = useMemo(() => stages.flatMap((s) => s.opportunities), [stages]);
  const open = allOpps.filter((o) => o.status === "open");
  const openValue = open.reduce((sum, o) => sum + toAmount(o.value), 0);
  const weighted = stages.reduce(
    (sum, s) => sum + s.opportunities.filter((o) => o.status === "open").reduce((a, o) => a + toAmount(o.value) * (s.probability / 100), 0),
    0
  );
  const potentialMrr = open.reduce((sum, o) => sum + toAmount(o.mrr), 0);
  const closed = allOpps.filter((o) => o.status !== "open");
  const closeRate = closed.length ? Math.round((closed.filter((o) => o.status === "won").length / closed.length) * 100) : null;

  function onDragStart(event: DragStartEvent) {
    setActiveDrag(allOpps.find((o) => o.id === event.active.id) ?? null);
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const oppId = String(event.active.id);
    const stageId = event.over ? String(event.over.id) : null;
    if (!stageId) return;
    const opp = allOpps.find((o) => o.id === oppId);
    if (!opp || opp.stageId === stageId) return;
    const stage = stages.find((s) => s.id === stageId);
    const result = await moveOpportunity(oppId, stageId);
    if (!result.ok) toast.error(result.error);
    else {
      toast.success(`Moved to ${stage?.name ?? "stage"}`);
      router.refresh();
    }
  }

  async function outcome(opp: Opp, kind: "won" | "lost") {
    const result = await markOpportunityOutcome(opp.id, kind);
    if (!result.ok) toast.error(result.error);
    else {
      toast.success(kind === "won" ? "Marked won" : "Marked lost");
      setDrawer(null);
      router.refresh();
    }
  }

  return (
    <div>
      <PageHeader title="Sales Pipeline" description="Track revenue opportunities from first contact through closed revenue.">
        <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="size-3.5" /> Add Opportunity
        </Button>
      </PageHeader>

      <MetricGrid>
        <MetricCard label="Open pipeline" value={formatMoney(openValue)} hint={`${open.length} open deals`} />
        <MetricCard label="Weighted pipeline" value={formatMoney(weighted)} hint="value × stage probability" />
        <MetricCard label="Potential MRR" value={formatMoney(potentialMrr)} hint="if all open deals close" />
        <MetricCard label="Won" value={allOpps.filter((o) => o.status === "won").length} hint="all time" />
        <MetricCard label="Close rate" value={closeRate === null ? "—" : `${closeRate}%`} hint="won / closed" />
      </MetricGrid>

      {stages.length === 0 ? (
        <EmptyState icon={Kanban} title="No pipeline stages" description="Create stages in Settings → Pipeline to start tracking deals." />
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex items-start gap-2.5 overflow-x-auto pb-3">
            {stages.map((stage) => (
              <StageColumn key={stage.id} stage={stage} onOpen={(o) => setDrawer(o)} />
            ))}
          </div>
          <DragOverlay>{activeDrag ? <div className="w-[232px]"><OppCard opp={activeDrag} dragging /></div> : null}</DragOverlay>
        </DndContext>
      )}

      <OpportunityFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        stages={stages}
        members={members}
        leads={leads}
        opportunity={
          editing
            ? {
                id: editing.id, name: editing.name, stageId: editing.stageId,
                contactName: editing.contactName ?? "", value: editing.value, mrr: editing.mrr,
                ownerId: editing.ownerId ?? "", expectedCloseDate: editing.expectedCloseDate ?? "",
              }
            : null
        }
      />

      <ConvertDialog
        open={Boolean(convertTarget)}
        onOpenChange={(o) => !o && setConvertTarget(null)}
        opportunity={convertTarget}
        services={services}
      />

      <DetailDrawer
        open={Boolean(drawer)}
        onOpenChange={(o) => !o && setDrawer(null)}
        title={drawer && (
          <span className="flex items-center gap-2.5">
            <ClientAvatar name={drawer.name} className="size-8 text-xs" /> {drawer.name}
          </span>
        )}
        description={drawer ? `Stage: ${stages.find((s) => s.id === drawer.stageId)?.name ?? "—"}` : undefined}
        footer={
          drawer && drawer.status === "open" ? (
            <>
              <Button size="sm" className="gap-1.5" onClick={() => { setConvertTarget(drawer); setDrawer(null); }}>
                <Trophy className="size-3.5" /> Mark Won → Client
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => outcome(drawer, "lost")}>
                <XCircle className="size-3.5" /> Mark Lost
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEditing(drawer); setDrawer(null); setFormOpen(true); }}>
                <Pencil className="size-3.5" /> Edit
              </Button>
            </>
          ) : (
            drawer && <StatusBadge status={drawer.status} />
          )
        }
      >
        {drawer && (
          <dl className="grid grid-cols-[130px_1fr] gap-y-2.5 text-[12.5px]">
            <dt className="text-muted-foreground">Status</dt><dd><StatusBadge status={drawer.status} /></dd>
            <dt className="text-muted-foreground">Deal value</dt><dd><FinancialAmount value={drawer.value} /></dd>
            <dt className="text-muted-foreground">Potential MRR</dt><dd>{toAmount(drawer.mrr) > 0 ? <FinancialAmount value={drawer.mrr} suffix="/mo" /> : "—"}</dd>
            <dt className="text-muted-foreground">Contact</dt><dd>{drawer.contactName ?? "—"}</dd>
            <dt className="text-muted-foreground">Owner</dt><dd>{drawer.ownerName ?? "Unassigned"}</dd>
            <dt className="text-muted-foreground">Expected close</dt><dd>{drawer.expectedCloseDate ? format(new Date(drawer.expectedCloseDate), "MMM d, yyyy") : "—"}</dd>
            <dt className="text-muted-foreground">Created</dt><dd>{format(new Date(drawer.createdAt), "MMM d, yyyy")}</dd>
          </dl>
        )}
      </DetailDrawer>
    </div>
  );
}
