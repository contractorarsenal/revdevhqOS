"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronLeft, Eye, EyeOff, Pencil, Plus } from "lucide-react";
import { setTaskCompletion, setTaskClientVisible } from "@/server/actions/tasks";
import { postProjectUpdate } from "@/server/actions/projects";
import { WAITING_ON_LABEL } from "@/lib/project-ops";
import type { WaitingOnParty } from "@/lib/validation";
import { StatusBadge } from "@/components/shared/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { TaskFormDialog } from "@/features/tasks/task-form-dialog";
import { ProjectFormDialog } from "./project-form-dialog";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ProjectDetailView({
  detail, members, clients,
}: {
  detail: any;
  members: { userId: string; name: string }[];
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { project, tasks, updates, taskCount, completedCount, progress, upcoming } = detail;
  const [updateText, setUpdateText] = useState("");
  const [shareUpdate, setShareUpdate] = useState(true);
  const [posting, setPosting] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  async function toggle(taskId: string, completed: boolean) {
    const result = await setTaskCompletion(taskId, completed);
    if (!result.ok) toast.error(result.error);
    else router.refresh();
  }

  async function toggleVisible(taskId: string, visible: boolean) {
    const result = await setTaskClientVisible(taskId, visible);
    if (!result.ok) toast.error(result.error);
    else router.refresh();
  }

  async function post() {
    if (!updateText.trim()) return;
    setPosting(true);
    const result = await postProjectUpdate(project.id, { body: updateText, clientVisible: shareUpdate });
    setPosting(false);
    if (!result.ok) return toast.error(result.error);
    setUpdateText("");
    toast.success("Update posted");
    router.refresh();
  }

  return (
    <div>
      <Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3.5" /> Projects
      </Link>
      <div className="mb-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="mt-1.5 size-3 shrink-0 rounded-full" style={{ backgroundColor: project.color ?? "#71717a" }} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-semibold">{project.name}</h1>
              <StatusBadge status={project.status} />
            </div>
            {project.description && <p className="mt-1 text-[12.5px] text-muted-foreground">{project.description}</p>}
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              {project.clientName ?? "Internal"}
              {project.dueDate && ` · Due ${project.dueDate}`}
              {project.clientId && (project.clientVisible ? " · Visible in client portal" : " · Hidden from client portal")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}><Pencil className="size-3.5" /> Edit</Button>
            <Button size="sm" className="gap-1.5" onClick={() => setTaskOpen(true)}><Plus className="size-3.5" /> Add task</Button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border/60 pt-3 text-[12.5px] sm:grid-cols-5">
          <div>
            <dt className="text-muted-foreground">Current stage</dt>
            <dd className="mt-0.5"><StatusBadge status={project.status} /></dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Owner</dt>
            <dd className="mt-0.5 font-semibold">{project.ownerName ?? "Unassigned"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Waiting on</dt>
            <dd className="mt-0.5 font-semibold">
              {project.waitingOn || "—"}
              {project.waitingOnParty && <span className="ml-1 text-[11px] font-normal text-muted-foreground">({WAITING_ON_LABEL[project.waitingOnParty as WaitingOnParty]})</span>}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Next action</dt>
            <dd className="mt-0.5 font-semibold">{project.nextAction || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last update</dt>
            <dd className="mt-0.5 font-semibold">{formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}</dd>
          </div>
        </dl>

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
                {project.clientId && (
                  <button
                    type="button"
                    onClick={() => toggleVisible(t.id, !t.clientVisible)}
                    title={t.clientVisible ? "Visible to client — click to hide" : "Hidden from client — click to show in portal checklist"}
                    aria-label={t.clientVisible ? "Hide from client" : "Show to client"}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {t.clientVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>
                )}
                <StatusBadge status={t.priority} />
                {t.dueDate && <span className="text-[11px] text-muted-foreground">{format(new Date(t.dueDate), "MMM d")}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-border bg-card shadow-sm">
        <header className="border-b border-border/60 px-4 py-2.5"><h2 className="text-[12.5px] font-semibold">Project updates</h2></header>
        <div className="space-y-2 border-b border-border/40 p-4">
          <textarea
            value={updateText} onChange={(e) => setUpdateText(e.target.value)} rows={2} maxLength={3000}
            placeholder="Post a progress update…"
            className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm"
          />
          <div className="flex items-center gap-3">
            {project.clientId && (
              <label className="flex items-center gap-2 text-[12px]">
                <input type="checkbox" checked={shareUpdate} onChange={(e) => setShareUpdate(e.target.checked)} className="size-4 accent-[var(--primary)]" />
                Share with client
              </label>
            )}
            <Button size="sm" className="ml-auto" disabled={posting || !updateText.trim()} onClick={post}>{posting ? "Posting…" : "Post update"}</Button>
          </div>
        </div>
        {updates.length === 0 ? (
          <p className="px-4 py-4 text-xs text-muted-foreground">No updates yet.</p>
        ) : (
          <ul>
            {updates.map((u: any) => (
              <li key={u.id} className="border-t border-border/40 px-4 py-2.5 first:border-t-0">
                <p className="text-[12.5px]">{u.body}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {u.authorName ?? "Team"} · {formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })} · {u.clientVisible ? "Shared with client" : "Internal"}
                </p>
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

      <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} members={members} clients={clients} project={project} />
    </div>
  );
}
