"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Kanban, Plus, Trophy, XCircle, Pencil, ChevronDown, ChevronUp } from "lucide-react";
import { type StageWithOpps } from "@/server/queries/pipeline";
import { moveOpportunity, markOpportunityOutcome } from "@/server/actions/pipeline";
import { PageHeader } from "@/components/shared/page-header";
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
  const mrr = toAmount(opp.mrr);
  return (
    <button
      onClick={() => onOpen?.(opp)}
      className={cn(
        "w-full rounded-md border border-border bg-card px-3 py-2.5 text-left shadow-sm outline-none transition-colors hover:border-foreground/25 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-primary active:bg-accent",
        dragging && "rotate-1 shadow-lg"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight">{opp.name}</p>
          {opp.contactName && <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{opp.contactName}</p>}
        </div>
        {opp.ownerName && <ClientAvatar name={opp.ownerName} className="size-5 shrink-0 rounded-full text-[9px]" />}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <FinancialAmount value={opp.value} className="text-[15px] font-semibold tracking-tight" />
        {mrr > 0 && <FinancialAmount value={opp.mrr} className="text-[11px] text-muted-foreground" suffix="/mo" />}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
        <span>Updated {formatDistanceToNowStrict(new Date(opp.updatedAt), { addSuffix: true })}</span>
        {opp.expectedCloseDate && <span className="shrink-0 tabular-nums">Close {format(new Date(opp.expectedCloseDate), "MMM d")}</span>}
      </div>
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
  stage, onOpen, collapsed, onToggleCollapse,
}: { stage: StageWithOpps; onOpen: (o: Opp) => void; collapsed: boolean; onToggleCollapse: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = stage.opportunities.reduce((sum, o) => sum + toAmount(o.value), 0);
  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="flex w-9 shrink-0 flex-col items-center gap-2 self-start rounded-lg bg-muted/40 py-3 outline-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-primary dark:bg-muted/25"
        title={`Expand ${stage.name}`}
      >
        <ChevronDown className="size-3.5 text-muted-foreground" />
        <span className="rounded-full border border-border bg-card px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{stage.opportunities.length}</span>
        <span className="mt-1 origin-center rotate-180 whitespace-nowrap text-[11px] font-semibold [writing-mode:vertical-rl]">{stage.name}</span>
      </button>
    );
  }
  const weightedTotal = total * (stage.probability / 100);
  return (
    <section
      ref={setNodeRef}
      aria-label={`${stage.name} stage`}
      className={cn(
        "flex max-h-full w-[84vw] max-w-[272px] shrink-0 snap-start flex-col self-start rounded-lg bg-muted/40 sm:w-[252px] dark:bg-muted/25",
        isOver && "outline-2 outline-dashed outline-primary"
      )}
    >
      <header className="shrink-0 px-3 pb-2 pt-2.5">
        <div className="flex items-center gap-1.5">
          <button onClick={onToggleCollapse} className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary" title="Collapse column" aria-label={`Collapse ${stage.name}`}>
            <ChevronUp className="size-3.5" />
          </button>
          <h3 className={cn("truncate text-[12.5px] font-semibold", stage.isWon && "text-emerald-700 dark:text-emerald-400", stage.isLost && "text-red-700 dark:text-red-400")}>
            {stage.name}
          </h3>
          <span className="rounded-full bg-background/70 px-1.5 text-[10.5px] font-semibold tabular-nums text-muted-foreground">
            {stage.opportunities.length}
          </span>
          <span className="ml-auto rounded bg-background/70 px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground" title="Win probability for this stage">{stage.probability}%</span>
        </div>
        <p className="mt-1 text-[15px] font-semibold tabular-nums tracking-tight">{formatMoney(total)}</p>
        {stage.probability > 0 && stage.probability < 100 && total > 0 && (
          <p className="text-[10.5px] tabular-nums text-muted-foreground">{formatMoney(weightedTotal)} weighted</p>
        )}
      </header>
      <div className="flex min-h-[96px] flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
        {stage.opportunities.map((opp) => (
          <DraggableCard key={opp.id} opp={opp} onOpen={onOpen} />
        ))}
        {stage.opportunities.length === 0 && (
          <p className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border/70 py-5 text-center text-[11px] text-muted-foreground/70">Drop deals here</p>
        )}
      </div>
    </section>
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
  const boardRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = window.localStorage.getItem("rdhq-pipeline-collapsed");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  function toggleCollapse(stageId: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [stageId]: !prev[stageId] };
      try { localStorage.setItem("rdhq-pipeline-collapsed", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // Auto-scroll the board horizontally when dragging a card near an edge.
  function onDragOverEdge(clientX: number) {
    const el = boardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const edge = 60;
    if (clientX - rect.left < edge) el.scrollBy({ left: -16 });
    else if (rect.right - clientX < edge) el.scrollBy({ left: 16 });
  }

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
    window.addEventListener("pointermove", handlePointerMove);
  }
  function handlePointerMove(e: PointerEvent) {
    onDragOverEdge(e.clientX);
  }

  async function onDragEnd(event: DragEndEvent) {
    window.removeEventListener("pointermove", handlePointerMove);
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
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Sales Pipeline" description="Track revenue opportunities from first contact through closed revenue.">
        <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="size-3.5" /> Add Opportunity
        </Button>
      </PageHeader>

      <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-2 border-y border-border/70 py-2.5">
        {[
          ["Open pipeline", formatMoney(openValue), `${open.length} open deals`],
          ["Weighted", formatMoney(weighted), "value × stage probability"],
          ["Potential MRR", formatMoney(potentialMrr), "if all open deals close"],
          ["Won", String(allOpps.filter((o) => o.status === "won").length), "all time"],
          ["Close rate", closeRate === null ? "—" : `${closeRate}%`, "won / closed"],
        ].map(([label, value, hint]) => (
          <div key={label} className="min-w-0" title={hint}>
            <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="text-[17px] font-semibold tabular-nums tracking-tight">{value}</dd>
          </div>
        ))}
      </dl>

      {stages.length === 0 ? (
        <EmptyState icon={Kanban} title="No pipeline stages" description="Create stages in Settings → Pipeline to start tracking deals." />
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div ref={boardRef} className="flex min-h-0 flex-1 items-start gap-2.5 overflow-x-auto scroll-smooth pb-3 snap-x snap-mandatory sm:snap-none">
            {stages.map((stage) => (
              <StageColumn
                key={stage.id} stage={stage} onOpen={(o) => setDrawer(o)}
                collapsed={Boolean(collapsed[stage.id])}
                onToggleCollapse={() => toggleCollapse(stage.id)}
              />
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
