"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isToday, isPast, format } from "date-fns";
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { CheckSquare, Plus, Trash2, Pencil } from "lucide-react";
import { type TaskRow } from "@/server/queries/tasks";
import { setTaskCompletion, deleteTask, setTaskStatus } from "@/server/actions/tasks";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { TaskFormDialog, type RelatedOptions } from "./task-form-dialog";
import { buildMyDay } from "@/lib/calendar-feed";

type Group = { key: string; label: string; tone: string; tasks: TaskRow[] };
type ViewMode = "list" | "board" | "today";
const BOARD_STATUSES = ["todo", "in_progress", "waiting", "completed"] as const;
const STATUS_LABEL: Record<string, string> = { todo: "To do", in_progress: "In progress", waiting: "Waiting", completed: "Completed" };

/** Reflects the active view in the URL without a Next.js navigation, mirroring the Calendar page's pattern. */
function syncUrl(view: ViewMode) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("view", view);
  window.history.replaceState(null, "", url.toString());
}

function TaskRowItem({
  task, onToggle, onEdit, onDelete, showOverdue,
}: { task: TaskRow; onToggle: (t: TaskRow, v: boolean) => void; onEdit: (t: TaskRow) => void; onDelete: (t: TaskRow) => void; showOverdue?: boolean }) {
  const related = task.clientName ?? task.leadCompany ?? task.opportunityName;
  const done = task.status === "completed";
  return (
    <li className="flex items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0 hover:bg-muted/30">
      <Checkbox checked={done} onCheckedChange={(v) => onToggle(task, v === true)} aria-label="Complete task" />
      <button className="min-w-0 flex-1 text-left" onClick={() => onEdit(task)}>
        <p className={cn("truncate text-[13px] font-medium", done && "text-muted-foreground line-through")}>{task.title}</p>
        <p className="truncate text-[11.5px] text-muted-foreground">
          {task.projectName ? `${task.projectName} · ` : ""}
          {related ? `${related} · ` : ""}
          {task.assigneeName ?? "Unassigned"}
        </p>
      </button>
      <StatusBadge status={task.priority} />
      <span className={cn("w-24 text-right text-[11.5px] tabular-nums text-muted-foreground", showOverdue && "font-semibold text-red-700 dark:text-red-400")}>
        {task.dueDate ? format(new Date(task.dueDate), "MMM d") : "—"}
      </span>
      <span className="flex gap-0.5">
        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={() => onEdit(task)}><Pencil className="size-3.5" /></Button>
        <ConfirmationDialog
          trigger={<Button variant="ghost" size="icon" className="size-7 text-muted-foreground"><Trash2 className="size-3.5" /></Button>}
          title="Delete this task?" description={`"${task.title}" will be permanently removed.`} confirmLabel="Delete" destructive
          onConfirm={() => onDelete(task)}
        />
      </span>
    </li>
  );
}

function BoardCard({ task, onEdit }: { task: TaskRow; onEdit: (t: TaskRow) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn("touch-none", isDragging && "opacity-30")}>
      <button onClick={() => onEdit(task)} className="w-full rounded-lg border border-border bg-card p-2.5 text-left shadow-sm hover:border-muted-foreground/40">
        <p className="truncate text-[12.5px] font-semibold">{task.title}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{task.projectName ?? task.clientName ?? "—"}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <StatusBadge status={task.priority} />
          {task.dueDate && <span className="text-[10.5px] tabular-nums text-muted-foreground">{format(new Date(task.dueDate), "MMM d")}</span>}
        </div>
      </button>
    </div>
  );
}

function BoardColumn({ status, tasks, onEdit }: { status: string; tasks: TaskRow[]; onEdit: (t: TaskRow) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={cn("flex h-full w-[260px] shrink-0 flex-col rounded-lg border border-border/60 bg-muted/40 dark:bg-muted/20", isOver && "outline-2 outline-dashed outline-primary")}>
      <div className="shrink-0 px-3 pb-1.5 pt-2.5">
        <span className="text-xs font-semibold">{STATUS_LABEL[status]}</span>
        <span className="ml-1.5 rounded-full border border-border bg-card px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{tasks.length}</span>
      </div>
      <div className="flex min-h-[60px] flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
        {tasks.map((t) => <BoardCard key={t.id} task={t} onEdit={onEdit} />)}
        {tasks.length === 0 && <p className="py-3 text-center text-[10.5px] text-muted-foreground/60">No tasks</p>}
      </div>
    </div>
  );
}

export function TasksView({
  tasks, currentUserId, options, openNew, today, initialView, openTaskId,
}: {
  tasks: TaskRow[]; currentUserId: string; options: RelatedOptions; openNew: boolean; today: string;
  initialView?: ViewMode; openTaskId?: string;
}) {
  const router = useRouter();
  // Deep link from Dashboard ("open this specific task") — computed once at
  // mount, same idiom as the existing openNew prop, so no effect is needed.
  const deepLinkedTask = openTaskId ? tasks.find((t) => t.id === openTaskId) : undefined;
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [view, setView] = useState<ViewMode>(initialView ?? "board");
  const [formOpen, setFormOpen] = useState(openNew || Boolean(deepLinkedTask));
  const [editing, setEditing] = useState<TaskRow | null>(() => deepLinkedTask ?? null);

  function changeView(v: ViewMode) {
    setView(v);
    syncUrl(v);
  }
  const [projectFilter, setProjectFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const visible = useMemo(() => {
    let scoped = scope === "mine" ? tasks.filter((t) => t.assigneeId === currentUserId || !t.assigneeId) : tasks;
    if (projectFilter !== "all") scoped = scoped.filter((t) => t.projectId === projectFilter);
    if (assigneeFilter !== "all") scoped = scoped.filter((t) => t.assigneeId === assigneeFilter);
    if (priorityFilter !== "all") scoped = scoped.filter((t) => t.priority === priorityFilter);
    return scoped.map((t) => (statusOverrides[t.id] ? { ...t, status: statusOverrides[t.id] as TaskRow["status"] } : t));
  }, [tasks, scope, currentUserId, statusOverrides, projectFilter, assigneeFilter, priorityFilter]);

  const groups: Group[] = useMemo(() => {
    const open = visible.filter((t) => !["completed", "canceled"].includes(t.status));
    const done = visible.filter((t) => t.status === "completed");
    const overdue = open.filter((t) => t.dueDate && isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate)));
    const todayG = open.filter((t) => t.dueDate && isToday(new Date(t.dueDate)));
    const upcoming = open.filter((t) => t.dueDate && !isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate)));
    const noDate = open.filter((t) => !t.dueDate);
    return [
      { key: "overdue", label: "Overdue", tone: "text-red-700 dark:text-red-400", tasks: overdue },
      { key: "today", label: "Today", tone: "text-indigo-700 dark:text-indigo-300", tasks: todayG },
      { key: "upcoming", label: "Upcoming", tone: "", tasks: upcoming },
      { key: "nodate", label: "No due date", tone: "", tasks: noDate },
      { key: "done", label: "Completed", tone: "text-emerald-700 dark:text-emerald-400", tasks: done.slice(0, 15) },
    ].filter((g) => g.tasks.length > 0);
  }, [visible]);

  const myDayItems = useMemo(() => buildMyDay(visible, today), [visible, today]);

  async function toggle(task: TaskRow, completed: boolean) {
    setStatusOverrides((prev) => ({ ...prev, [task.id]: completed ? "completed" : "todo" }));
    const result = await setTaskCompletion(task.id, completed);
    if (!result.ok) {
      setStatusOverrides((prev) => ({ ...prev, [task.id]: completed ? "todo" : "completed" }));
      toast.error(result.error);
      return;
    }
    router.refresh();
  }
  async function onDelete(task: TaskRow) {
    const result = await deleteTask(task.id);
    if (!result.ok) toast.error(result.error);
    else { toast.success("Task deleted"); router.refresh(); }
  }
  function toEdit(task: TaskRow) {
    setEditing(task);
    setFormOpen(true);
  }
  async function onDragEnd(event: DragEndEvent) {
    const taskId = String(event.active.id);
    const status = event.over ? String(event.over.id) : null;
    if (!status) return;
    const task = visible.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    setStatusOverrides((prev) => ({ ...prev, [taskId]: status }));
    const result = await setTaskStatus(taskId, status as TaskRow["status"]);
    if (!result.ok) {
      setStatusOverrides((prev) => ({ ...prev, [taskId]: task.status }));
      toast.error(result.error);
      return;
    }
    toast.success(`Moved to ${STATUS_LABEL[status]}`);
    router.refresh();
  }

  const boardTasks = useMemo(() => visible.filter((t) => t.status !== "canceled"), [visible]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Tasks" description="Your work — organized by project, scheduled on your calendar.">
        <div className="flex rounded-md bg-muted p-0.5">
          {(["list", "board", "today"] as const).map((v) => (
            <button key={v} onClick={() => changeView(v)} className={cn("rounded px-2.5 py-1 text-xs font-semibold capitalize text-muted-foreground", view === v && "bg-card text-foreground shadow-sm")}>
              {v === "today" ? "My Day" : v}
            </button>
          ))}
        </div>
        <div className="flex rounded-md bg-muted p-0.5">
          {(["mine", "team"] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)} className={cn("rounded px-3 py-1 text-xs font-semibold text-muted-foreground", scope === s && "bg-card text-foreground shadow-sm")}>
              {s === "mine" ? "My Tasks" : "All Tasks"}
            </button>
          ))}
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="size-3.5" /> Add Task
        </Button>
      </PageHeader>

      {(view === "list" || view === "board") && (
        <div className="mb-3 flex flex-wrap gap-2">
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-xs">
            <option value="all">All projects</option>
            {(options.projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-xs">
            <option value="all">All assignees</option>
            {options.members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
          </select>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-xs">
            <option value="all">All priorities</option>
            {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      )}

      {view === "list" && (
        groups.length === 0 ? (
          <EmptyState icon={CheckSquare} title="No tasks here" description="Create a task and organize it by project."
            action={<Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="size-3.5" /> Add Task</Button>} />
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <section key={group.key} className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
                  <h2 className={cn("text-[12.5px] font-semibold", group.tone)}>{group.label}</h2>
                  <span className="rounded-full bg-muted px-1.5 text-[10.5px] font-semibold tabular-nums text-muted-foreground">{group.tasks.length}</span>
                </header>
                <ul>
                  {group.tasks.map((task) => (
                    <TaskRowItem key={task.id} task={task} onToggle={toggle} onEdit={toEdit} onDelete={onDelete} showOverdue={group.key === "overdue"} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )
      )}

      {view === "board" && (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex min-h-0 flex-1 items-stretch gap-2.5 overflow-x-auto pb-3">
            {BOARD_STATUSES.map((status) => (
              <BoardColumn key={status} status={status} tasks={boardTasks.filter((t) => t.status === status)} onEdit={toEdit} />
            ))}
          </div>
        </DndContext>
      )}

      {view === "today" && (
        <div className="space-y-4">
          {myDayItems.overdue.length === 0 && myDayItems.scheduledToday.length === 0 && myDayItems.dueToday.length === 0 ? (
            <EmptyState icon={CheckSquare} title="Nothing on your plate today" description="Schedule a task or check back tomorrow." />
          ) : (
            <>
              {myDayItems.overdue.length > 0 && (
                <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                  <header className="border-b border-border/60 px-4 py-2.5"><h2 className="text-[12.5px] font-semibold text-red-700 dark:text-red-400">Overdue</h2></header>
                  <ul>{myDayItems.overdue.map((t) => <TaskRowItem key={t.id} task={t} onToggle={toggle} onEdit={toEdit} onDelete={onDelete} showOverdue />)}</ul>
                </section>
              )}
              {myDayItems.scheduledToday.length > 0 && (
                <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                  <header className="border-b border-border/60 px-4 py-2.5"><h2 className="text-[12.5px] font-semibold">Scheduled today</h2></header>
                  <ul>{myDayItems.scheduledToday.map((t) => <TaskRowItem key={t.id} task={t} onToggle={toggle} onEdit={toEdit} onDelete={onDelete} />)}</ul>
                </section>
              )}
              {myDayItems.dueToday.length > 0 && (
                <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                  <header className="border-b border-border/60 px-4 py-2.5"><h2 className="text-[12.5px] font-semibold">Due today</h2></header>
                  <ul>{myDayItems.dueToday.map((t) => <TaskRowItem key={t.id} task={t} onToggle={toggle} onEdit={toEdit} onDelete={onDelete} />)}</ul>
                </section>
              )}
            </>
          )}
        </div>
      )}

      <TaskFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        options={options}
        today={today}
        task={
          editing
            ? {
                id: editing.id,
                title: editing.title,
                description: editing.description ?? "",
                status: editing.status,
                priority: editing.priority,
                assigneeId: editing.assigneeId ?? "",
                clientId: editing.clientId ?? "",
                leadId: editing.leadId ?? "",
                opportunityId: editing.opportunityId ?? "",
                projectId: editing.projectId ?? "",
                dueDateValue: editing.dueDate ? new Date(editing.dueDate).toISOString().slice(0, 10) : "",
                scheduledDate: editing.scheduledDate ?? "",
                scheduledStartTime: editing.scheduledStartTime ?? "",
                scheduledEndTime: editing.scheduledEndTime ?? "",
                allDay: editing.allDay ?? false,
              }
            : null
        }
      />
    </div>
  );
}
