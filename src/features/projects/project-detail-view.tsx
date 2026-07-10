"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ChevronLeft, Plus } from "lucide-react";
import { setTaskCompletion } from "@/server/actions/tasks";
import { StatusBadge } from "@/components/shared/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { TaskFormDialog } from "@/features/tasks/task-form-dialog";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ProjectDetailView({ detail }: { detail: any }) {
  const router = useRouter();
  const { project, tasks, taskCount, completedCount, progress, upcoming } = detail;
  const [taskOpen, setTaskOpen] = useState(false);

  async function toggle(taskId: string, completed: boolean) {
    const result = await setTaskCompletion(taskId, completed);
    if (!result.ok) toast.error(result.error);
    else router.refresh();
  }

  return (
    <div>
      <Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3.5" /> Projects
      </Link>
      <div className="mb-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="mt-1.5 size-3 shrink-0 rounded-full" style={{ backgroundColor: project.color ?? "#4F46E5" }} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-semibold">{project.name}</h1>
              <StatusBadge status={project.status} />
            </div>
            {project.description && <p className="mt-1 text-[12.5px] text-muted-foreground">{project.description}</p>}
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              {project.clientName ?? "Internal"} · Owner: {project.ownerName ?? "Unassigned"}
              {project.dueDate && ` · Due ${project.dueDate}`}
            </p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setTaskOpen(true)}><Plus className="size-3.5" /> Add task</Button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 border-t border-border/60 pt-3 text-[12.5px]">
          <div><p className="text-muted-foreground">Progress</p><p className="font-semibold">{progress}%</p></div>
          <div><p className="text-muted-foreground">Open tasks</p><p className="font-semibold">{taskCount - completedCount}</p></div>
          <div><p className="text-muted-foreground">Completed</p><p className="font-semibold">{completedCount} / {taskCount}</p></div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {upcoming.length > 0 && (
        <section className="mb-4 rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border/60 px-4 py-2.5"><h2 className="text-[12.5px] font-semibold">Upcoming scheduled tasks</h2></header>
          <ul>
            {upcoming.map((t: any) => (
              <li key={t.id} className="flex items-center gap-2.5 border-t border-border/40 px-4 py-2.5 first:border-t-0">
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{t.title}</span>
                <span className="text-[11px] text-muted-foreground">{t.scheduledDate}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="border-b border-border/60 px-4 py-2.5"><h2 className="text-[12.5px] font-semibold">Tasks</h2></header>
        {tasks.length === 0 ? (
          <p className="px-4 py-4 text-xs text-muted-foreground">No tasks yet.</p>
        ) : (
          <ul>
            {tasks.map((t: any) => (
              <li key={t.id} className="flex items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0">
                <Checkbox checked={t.status === "completed"} onCheckedChange={(v) => toggle(t.id, v === true)} />
                <span className={`min-w-0 flex-1 truncate text-[12.5px] font-medium ${t.status === "completed" ? "text-muted-foreground line-through" : ""}`}>{t.title}</span>
                <StatusBadge status={t.priority} />
                {t.dueDate && <span className="text-[11px] text-muted-foreground">{format(new Date(t.dueDate), "MMM d")}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <TaskFormDialog
        open={taskOpen} onOpenChange={setTaskOpen}
        options={{ members: [], clients: [], leads: [], opportunities: [], projects: [{ id: project.id, name: project.name }] }}
        task={null}
        fixedProjectId={project.id}
      />
    </div>
  );
}
