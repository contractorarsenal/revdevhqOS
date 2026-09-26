"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EyeOff, GripVertical, LayoutDashboard, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DEFAULT_DASHBOARD_LAYOUT, type DashboardLayout, type DashboardWidgetId } from "@/lib/dashboard-layout";
import { resetDashboardLayout, saveDashboardLayout } from "@/server/actions/dashboard";

/** `span` = column span at xl on the 12-column grid (primary 6, secondary/support 4, wide 8). */
export type DashboardWidgetDef = { id: DashboardWidgetId; title: string; span?: 4 | 6 | 8 | 12; node: React.ReactNode };

const SPAN: Record<number, string> = { 4: "xl:col-span-4", 6: "xl:col-span-6", 8: "xl:col-span-8", 12: "xl:col-span-12" };

function SortableWidget({ def, editing, onHide }: { def: DashboardWidgetDef; editing: boolean; onHide: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: def.id, disabled: !editing });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("min-w-0", SPAN[def.span ?? 4], (def.span ?? 4) >= 6 && "lg:col-span-2", isDragging && "z-20 opacity-80")}
    >
      {editing ? (
        <div className="rounded-md border border-dashed border-primary/60">
          <div className="flex items-center gap-2 border-b border-dashed border-primary/40 px-2 py-1">
            <button
              type="button" {...attributes} {...listeners} aria-label={`Drag to move ${def.title}`}
              className="cursor-grab touch-none rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing"
            >
              <GripVertical className="size-4" />
            </button>
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{def.title}</span>
            <button type="button" onClick={onHide} aria-label={`Hide ${def.title}`} className="rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
              <EyeOff className="size-4" />
            </button>
          </div>
          <div className="pointer-events-none select-none p-1 opacity-90">{def.node}</div>
        </div>
      ) : (
        def.node
      )}
    </div>
  );
}

/** Responsive modular grid with optional per-user customization. Widgets are
 * server-rendered; this component only owns order / visibility state. */
export function DashboardGrid({ widgets, layout }: { widgets: DashboardWidgetDef[]; layout: DashboardLayout }) {
  const [state, setState] = useState<DashboardLayout>(layout);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const byId = new Map(widgets.map((w) => [w.id, w]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const visible = state.order.filter((id) => !state.hidden.includes(id) && byId.has(id));
  const hiddenDefs = state.hidden.filter((id) => byId.has(id));

  function persist(next: DashboardLayout) {
    startTransition(async () => {
      const r = await saveDashboardLayout(next);
      if (!r.ok) toast.error(r.error);
    });
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = state.order.indexOf(e.active.id as DashboardWidgetId);
    const to = state.order.indexOf(e.over.id as DashboardWidgetId);
    if (from < 0 || to < 0) return;
    const next = { ...state, order: arrayMove(state.order, from, to) };
    setState(next);
    persist(next);
  }

  function hide(id: DashboardWidgetId) {
    const next = { ...state, hidden: [...state.hidden, id] };
    setState(next);
    persist(next);
  }
  function show(id: DashboardWidgetId) {
    const next = { ...state, hidden: state.hidden.filter((h) => h !== id) };
    setState(next);
    persist(next);
  }
  function reset() {
    setState(DEFAULT_DASHBOARD_LAYOUT);
    startTransition(async () => {
      const r = await resetDashboardLayout();
      if (!r.ok) toast.error(r.error);
      else toast.success("Layout reset");
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <p className="text-[12px] text-muted-foreground">Drag widgets to rearrange, or hide the ones you don&apos;t need. Changes save automatically.</p>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={reset} disabled={pending}><RotateCcw className="size-3.5" /> Reset layout</Button>
              <Button size="sm" onClick={() => setEditing(false)}>Done</Button>
            </div>
          </>
        ) : (
          <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => setEditing(true)}>
            <LayoutDashboard className="size-3.5" /> Customize
          </Button>
        )}
      </div>

      {editing && hiddenDefs.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-[12px]">
          <span className="text-muted-foreground">Hidden:</span>
          {hiddenDefs.map((id) => (
            <button key={id} onClick={() => show(id)} className="rounded-sm border border-border px-2 py-0.5 font-medium hover:bg-accent">+ {byId.get(id)!.title}</button>
          ))}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible} strategy={rectSortingStrategy}>
          <div className="grid grid-flow-row-dense grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-12">
            {visible.map((id) => (
              <SortableWidget key={id} def={byId.get(id)!} editing={editing} onHide={() => hide(id)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
