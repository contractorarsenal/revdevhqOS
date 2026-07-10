"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EventFormDialog, type EventDefaults } from "./event-form-dialog";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ev = any;
type ViewMode = "day" | "week" | "month";

const HOUR_START = 6;
const HOUR_END = 21;
const DAY_MS = 86400000;

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const s = new Date(d);
  s.setDate(d.getDate() + diff);
  s.setHours(0, 0, 0, 0);
  return s;
}
function toDateInput(d: Date) { return d.toISOString().slice(0, 10); }
function toTimeInput(d: Date) { return d.toTimeString().slice(0, 5); }
function fmtTime(d: Date) { return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }

function EventBlock({ ev, onClick, style }: { ev: Ev; onClick: () => void; style?: React.CSSProperties }) {
  return (
    <button
      onClick={onClick}
      style={{ backgroundColor: (ev.color ?? "#4F46E5") + "22", borderColor: ev.color ?? "#4F46E5", ...style }}
      className={cn(
        "absolute left-0.5 right-0.5 overflow-hidden rounded-md border-l-2 px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm hover:brightness-95",
        ev.status === "cancelled" && "opacity-50 line-through"
      )}
    >
      <p className="truncate font-semibold" style={{ color: ev.color ?? "#4F46E5" }}>{ev.title}</p>
      {ev.clientName && <p className="truncate text-muted-foreground">{ev.clientName}</p>}
    </button>
  );
}

export function CalendarView({
  events, members, clients, initialWeekStart,
}: { events: Ev[]; members: { userId: string; name: string }[]; clients: { id: string; name: string }[]; initialWeekStart: string }) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(new Date(initialWeekStart));
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EventDefaults | null>(null);

  const parsed = useMemo(() => events.map((e) => ({ ...e, startAt: new Date(e.startAt), endAt: new Date(e.endAt) })), [events]);

  const days = useMemo(() => {
    if (view === "day") return [new Date(anchor)];
    if (view === "week") {
      const start = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY_MS));
    }
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeek(monthStart);
    return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * DAY_MS));
  }, [view, anchor]);

  function eventsOn(day: Date) {
    return parsed.filter((e) => e.startAt.toDateString() === day.toDateString()).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }

  function openNew(day?: Date) {
    setEditing(day ? { date: toDateInput(day) } : null);
    setFormOpen(true);
  }
  function openEdit(ev: Ev) {
    setEditing({
      id: ev.id, title: ev.title, clientId: ev.clientId, date: toDateInput(ev.startAt),
      startTime: toTimeInput(ev.startAt), endTime: toTimeInput(ev.endAt),
      assigneeId: ev.assigneeId, color: ev.color, notes: ev.notes, status: ev.status,
    });
    setFormOpen(true);
  }
  function navigate(dir: -1 | 1) {
    const next = new Date(anchor);
    if (view === "day") next.setDate(next.getDate() + dir);
    else if (view === "week") next.setDate(next.getDate() + dir * 7);
    else next.setMonth(next.getMonth() + dir);
    setAnchor(next);
  }

  const label = view === "month"
    ? anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : view === "day"
      ? anchor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
      : `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const hourHeight = 48;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Calendar" description="Schedule and track jobs, estimates, and team time.">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate(-1)}><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>Today</Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => navigate(1)}><ChevronRight className="size-4" /></Button>
        </div>
        <p className="min-w-[180px] text-sm font-semibold">{label}</p>
        <div className="flex rounded-md bg-muted p-0.5">
          {(["day", "week", "month"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={cn("rounded px-2.5 py-1 text-xs font-semibold capitalize text-muted-foreground", view === v && "bg-card text-foreground shadow-sm")}>
              {v}
            </button>
          ))}
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => openNew()}><Plus className="size-3.5" /> Schedule Event</Button>
      </PageHeader>

      {view === "month" ? (
        <div className="grid flex-1 grid-cols-7 gap-px overflow-y-auto rounded-lg border border-border bg-border">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="bg-muted px-2 py-1 text-center text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{d}</div>
          ))}
          {days.map((day, i) => {
            const dayEvents = eventsOn(day);
            const inMonth = day.getMonth() === anchor.getMonth();
            return (
              <button key={i} onClick={() => openNew(day)} className={cn("min-h-[92px] bg-card p-1.5 text-left hover:bg-muted/40", !inMonth && "opacity-40")}>
                <p className="text-[11px] font-semibold">{day.getDate()}</p>
                <div className="mt-1 space-y-0.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div key={ev.id} onClick={(e) => { e.stopPropagation(); openEdit(ev); }}
                      className="truncate rounded px-1 text-[10px] font-medium" style={{ backgroundColor: (ev.color ?? "#4F46E5") + "22", color: ev.color ?? "#4F46E5" }}>
                      {ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && <p className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</p>}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-y-auto rounded-lg border border-border">
          <div className="w-14 shrink-0 border-r border-border">
            <div className="h-9 border-b border-border" />
            {hours.map((h) => (
              <div key={h} style={{ height: hourHeight }} className="border-b border-border/50 px-1.5 pt-0.5 text-right text-[10px] text-muted-foreground">
                {h % 12 === 0 ? 12 : h % 12}{h < 12 ? "am" : "pm"}
              </div>
            ))}
          </div>
          <div className={cn("grid flex-1", view === "week" ? "grid-cols-7" : "grid-cols-1")}>
            {days.map((day, i) => {
              const dayEvents = eventsOn(day);
              const isToday = day.toDateString() === new Date().toDateString();
              return (
                <div key={i} className="relative border-r border-border last:border-r-0">
                  <div className={cn("sticky top-0 z-10 h-9 border-b border-border bg-card px-2 py-1 text-center text-[11px] font-semibold", isToday && "text-primary")}>
                    {day.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
                  </div>
                  <div className="relative cursor-pointer" style={{ height: hours.length * hourHeight }} onClick={() => openNew(day)}>
                    {hours.map((h) => (
                      <div key={h} style={{ height: hourHeight }} className="border-b border-border/50" />
                    ))}
                    {dayEvents.map((ev) => {
                      const startMin = (ev.startAt.getHours() - HOUR_START) * 60 + ev.startAt.getMinutes();
                      const durMin = Math.max(20, (ev.endAt.getTime() - ev.startAt.getTime()) / 60000);
                      const top = (startMin / 60) * hourHeight;
                      const height = (durMin / 60) * hourHeight;
                      return (
                        <EventBlock key={ev.id} ev={ev} onClick={(e?: any) => { e?.stopPropagation?.(); openEdit(ev); }} style={{ top, height }} />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <EventFormDialog open={formOpen} onOpenChange={setFormOpen} defaults={editing} clients={clients} members={members} />
    </div>
  );
}
