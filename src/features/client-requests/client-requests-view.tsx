"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ClipboardList, Plus } from "lucide-react";
import { createClientRequest, updateClientRequestStatus, triageClientRequestToTask } from "@/server/actions/client-requests";
import { CLIENT_REQUEST_TYPES, CLIENT_REQUEST_STATUSES } from "@/lib/validation";
import type { ClientRequestRow } from "@/server/queries/client-requests";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const REQUEST_TYPE_LABEL: Record<(typeof CLIENT_REQUEST_TYPES)[number], string> = {
  photo_change: "Photo change",
  phone_update: "Phone update",
  content_revision: "Content revision",
  new_page: "New page",
  new_service: "New service",
  bug: "Bug",
  form_issue: "Form issue",
  tracking_issue: "Tracking issue",
  technical_problem: "Technical problem",
  support_request: "Support request",
  other: "Other",
};

export const REQUEST_STATUS_LABEL: Record<(typeof CLIENT_REQUEST_STATUSES)[number], string> = {
  new: "New",
  triaged: "Triaged",
  in_progress: "In progress",
  waiting: "Waiting",
  complete: "Complete",
  client_notified: "Client notified",
};

export function ClientRequestsView({
  items, clients, members,
}: {
  items: ClientRequestRow[];
  clients: { id: string; name: string }[];
  members: { userId: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [triageTarget, setTriageTarget] = useState<ClientRequestRow | null>(null);
  const [triageError, setTriageError] = useState<string | null>(null);

  const open = items.filter((r) => r.status !== "complete" && r.status !== "client_notified");
  const closed = items.filter((r) => r.status === "complete" || r.status === "client_notified");

  function submitCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createClientRequest({
        clientId: String(form.get("clientId")),
        type: String(form.get("type")),
        description: String(form.get("description")),
        priority: String(form.get("priority")),
      });
      if (!result.ok) return setCreateError(result.error);
      toast.success("Request logged");
      setCreateOpen(false);
      router.refresh();
    });
  }

  function changeStatus(id: string, status: string) {
    startTransition(async () => {
      const result = await updateClientRequestStatus(id, { status });
      if (!result.ok) toast.error(result.error);
      else { toast.success("Status updated"); router.refresh(); }
    });
  }

  function submitTriage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!triageTarget) return;
    setTriageError(null);
    const form = new FormData(e.currentTarget);
    const target = triageTarget;
    startTransition(async () => {
      const result = await triageClientRequestToTask(target.id, {
        taskTitle: String(form.get("taskTitle")),
        assigneeId: String(form.get("assigneeId") ?? ""),
        dueDate: String(form.get("dueDate") ?? ""),
      });
      if (!result.ok) return setTriageError(result.error);
      toast.success("Task created and linked");
      setTriageTarget(null);
      router.refresh();
    });
  }

  return (
    <div>
      <PageHeader title="Client requests" description="What clients have asked for — separate from the internal work to execute it.">
        <Button size="sm" className="gap-1.5" onClick={() => { setCreateError(null); setCreateOpen(true); }}>
          <Plus className="size-3.5" /> Log request
        </Button>
      </PageHeader>

      {open.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No open requests" description="Client-submitted or staff-logged requests appear here." />
      ) : (
        <div className="space-y-3">
          {open.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-semibold">{r.clientName ?? "Unknown client"}</p>
                    <StatusBadge status={r.type} tone="neutral" />
                    <StatusBadge status={r.priority} />
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {r.submittedByName ?? "Someone"} · {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <select
                  value={r.status}
                  disabled={pending}
                  onChange={(e) => changeStatus(r.id, e.target.value)}
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                >
                  {CLIENT_REQUEST_STATUSES.map((s) => <option key={s} value={s}>{REQUEST_STATUS_LABEL[s]}</option>)}
                </select>
              </div>
              <p className="mt-2 text-[12.5px]">{r.description}</p>
              <div className="mt-3 flex items-center gap-2">
                {r.taskId ? (
                  <span className="text-[11.5px] text-muted-foreground">Linked task: {r.taskTitle}</span>
                ) : (
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => { setTriageError(null); setTriageTarget(r); }}>
                    Create task
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[12px] font-semibold text-muted-foreground">Completed</h2>
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            {closed.slice(0, 20).map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium">{r.clientName} · {REQUEST_TYPE_LABEL[r.type as (typeof CLIENT_REQUEST_TYPES)[number]]}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{r.description}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </section>
      )}

      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log a client request</DialogTitle>
            <DialogDescription>For requests that came in by phone, email, or in person.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-3">
            <div className="space-y-1">
              <Label>Client *</Label>
              <select name="clientId" required className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                <option value="">Select a client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <select name="type" defaultValue="other" className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                {CLIENT_REQUEST_TYPES.map((t) => <option key={t} value={t}>{REQUEST_TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Priority</Label>
              <select name="priority" defaultValue="medium" className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Description *</Label>
              <textarea name="description" required rows={3} className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm" />
            </div>
            {createError && <p className="text-xs text-destructive">{createError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Log request"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(triageTarget)} onOpenChange={(o) => !o && setTriageTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create execution task</DialogTitle>
            <DialogDescription>Creates a task and links it to this request. Moves the request to In progress.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitTriage} className="space-y-3">
            <div className="space-y-1">
              <Label>Task title *</Label>
              <Input name="taskTitle" required defaultValue={triageTarget ? `${REQUEST_TYPE_LABEL[triageTarget.type as (typeof CLIENT_REQUEST_TYPES)[number]]} — ${triageTarget.clientName ?? ""}` : ""} />
            </div>
            <div className="space-y-1">
              <Label>Assignee</Label>
              <select name="assigneeId" className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Due date</Label>
              <Input type="date" name="dueDate" />
            </div>
            {triageError && <p className="text-xs text-destructive">{triageError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTriageTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create task"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
