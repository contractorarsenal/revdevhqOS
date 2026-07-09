"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isToday, isPast, format } from "date-fns";
import { CheckSquare, Plus, Trash2, Pencil } from "lucide-react";
import { type TaskRow } from "@/server/queries/tasks";
import { setTaskCompletion, deleteTask } from "@/server/actions/tasks";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { TaskFormDialog, type RelatedOptions } from "./task-form-dialog";

type Group = { key: string; label: string; tone: string; tasks: TaskRow[] };

export function TasksView({
  tasks, currentUserId, options, openNew,
}: { tasks: TaskRow[]; currentUserId: string; options: RelatedOptions; openNew: boolean }) {
  const router = useRouter();
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [formOpen, setFormOpen] = useState(openNew);
  const [editing, setEditing] = useState<TaskRow | null>(null);

  // Optimistic: the checkbox flips instantly; server failure reverts it.
  const [statusOverrides, setStatusOverrides] = useState<Record<string, "completed" | "todo">>({});

  const visible = useMemo(() => {
    const scoped = scope === "mine" ? tasks.filter((t) => t.assigneeId === currentUserId || !t.assigneeId) : tasks;
    return scoped.map((t) => (statusOverrides[t.id] ? { ...t, status: statusOverrides[t.id] } : t));
  }, [tasks, scope, currentUserId, statusOverrides]);

  const groups: Group[] = useMemo(() => {
    const open = visible.filter((t) => ["todo", "in_progress"].includes(t.status));
    const done = visible.filter((t) => t.status === "completed");
    const overdue = open.filter((t) => t.dueDate && isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate)));
    const today = open.filter((t) => t.dueDate && isToday(new Date(t.dueDate)));
    const upcoming = open.filter((t) => t.dueDate && !isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate)));
    const noDate = open.filter((t) => !t.dueDate);
    return [
      { key: "overdue", label: "Overdue", tone: "text-red-700 dark:text-red-400", tasks: overdue },
      { key: "today", label: "Today", tone: "text-indigo-700 dark:text-indigo-300", tasks: today },
      { key: "upcoming", label: "Upcoming", tone: "", tasks: upcoming },
      { key: "nodate", label: "No due date", tone: "", tasks: noDate },
      { key: "done", label: "Completed", tone: "text-emerald-700 dark:text-emerald-400", tasks: done.slice(0, 15) },
    ].filter((g) => g.tasks.length > 0);
  }, [visible]);

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

  function toEdit(task: TaskRow) {
    setEditing(task);
    setFormOpen(true);
  }

  return (
    <div>
      <PageHeader title="Tasks" description="Manage work connected to clients, leads, and sales opportunities.">
        <div className="flex rounded-md bg-muted p-0.5">
          {(["mine", "team"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={cn(
                "rounded px-3 py-1 text-xs font-semibold text-muted-foreground",
                scope === s && "bg-card text-foreground shadow-sm"
              )}
            >
              {s === "mine" ? "My Tasks" : "All Tasks"}
            </button>
          ))}
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="size-3.5" /> Add Task
        </Button>
      </PageHeader>

      {groups.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No tasks here"
          description="Create a task and link it to a client, lead, or deal."
          action={<Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="size-3.5" /> Add Task</Button>}
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.key} className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
                <h2 className={cn("text-[12.5px] font-semibold", group.tone)}>{group.label}</h2>
                <span className="rounded-full bg-muted px-1.5 text-[10.5px] font-semibold tabular-nums text-muted-foreground">
                  {group.tasks.length}
                </span>
              </header>
              <ul>
                {group.tasks.map((task) => {
                  const related = task.clientName ?? task.leadCompany ?? task.opportunityName;
                  const done = task.status === "completed";
                  return (
                    <li key={task.id} className="flex items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0 hover:bg-muted/30">
                      <Checkbox checked={done} onCheckedChange={(v) => toggle(task, v === true)} aria-label="Complete task" />
                      <button className="min-w-0 flex-1 text-left" onClick={() => toEdit(task)}>
                        <p className={cn("truncate text-[13px] font-medium", done && "text-muted-foreground line-through")}>
                          {task.title}
                        </p>
                        <p className="truncate text-[11.5px] text-muted-foreground">
                          {related ? `${related} · ` : ""}
                          {task.assigneeName ?? "Unassigned"}
                        </p>
                      </button>
                      <StatusBadge status={task.priority} />
                      <span
                        className={cn(
                          "w-24 text-right text-[11.5px] tabular-nums text-muted-foreground",
                          group.key === "overdue" && "font-semibold text-red-700 dark:text-red-400"
                        )}
                      >
                        {task.dueDate ? format(new Date(task.dueDate), "MMM d") : "—"}
                      </span>
                      <span className="flex gap-0.5">
                        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={() => toEdit(task)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <ConfirmationDialog
                          trigger={<Button variant="ghost" size="icon" className="size-7 text-muted-foreground"><Trash2 className="size-3.5" /></Button>}
                          title="Delete this task?"
                          description={`"${task.title}" will be permanently removed.`}
                          confirmLabel="Delete"
                          destructive
                          onConfirm={async () => {
                            const result = await deleteTask(task.id);
                            if (!result.ok) toast.error(result.error);
                            else {
                              toast.success("Task deleted");
                              router.refresh();
                            }
                          }}
                        />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <TaskFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        options={options}
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
                dueDateValue: editing.dueDate ? new Date(editing.dueDate).toISOString().slice(0, 10) : "",
              }
            : null
        }
      />
    </div>
  );
}
