"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ClipboardList, Plus } from "lucide-react";
import { submitClientRequest } from "@/server/actions/portal-client-requests";
import { CLIENT_REQUEST_TYPES } from "@/lib/validation";
import { REQUEST_TYPE_LABEL } from "@/features/client-requests/client-requests-view";
import { PORTAL_REQUEST_STATUS } from "@/lib/portal-request-status";
import { type PortalRequestRow } from "@/server/queries/portal-data";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PortalHeading } from "./portal-ui";

export function PortalRequestsView({
  requests, projects, canSubmit,
}: { requests: PortalRequestRow[]; projects: { id: string; name: string }[]; canSubmit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await submitClientRequest({
        type: String(form.get("type")),
        description: String(form.get("description")),
        priority: String(form.get("priority") ?? "medium"),
        projectId: String(form.get("projectId") ?? ""),
      });
      if (!result.ok) return setError(result.error);
      toast.success("Request sent");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div>
      <PortalHeading title="Requests" description="Ask for a change, report a problem, or request support.">
        {canSubmit && <Button size="sm" className="gap-1.5" onClick={() => { setError(null); setOpen(true); }}><Plus className="size-3.5" /> New request</Button>}
      </PortalHeading>

      {requests.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No requests yet" description="Anything you ask for shows up here so you can track it." />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          {requests.map((r) => {
            const s = PORTAL_REQUEST_STATUS[r.status];
            return (
              <article key={r.id} className="border-t border-border px-4 py-3.5 first:border-t-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-semibold">{REQUEST_TYPE_LABEL[r.type as (typeof CLIENT_REQUEST_TYPES)[number]]}</p>
                  <StatusBadge status={s?.waitingOnYou ? "waiting_on_client" : s?.done ? "completed" : "in_progress"} tone={s?.waitingOnYou ? "amber" : undefined} />
                  <span className="text-[11.5px] text-muted-foreground">{s?.label}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">Submitted {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[12.5px]">{r.description}</p>
                {r.projectName && <p className="mt-1 text-[11.5px] text-muted-foreground">Project: {r.projectName}</p>}
                {r.clientUpdate && (
                  <p className="mt-2 border-l-2 border-primary bg-accent/40 px-3 py-1.5 text-[12.5px]">
                    <span className="font-semibold">Latest update: </span>{r.clientUpdate}
                  </p>
                )}
                {s?.waitingOnYou && <p className="mt-1.5 text-[12px] font-medium text-amber-600 dark:text-amber-400">Contractor Arsenal is waiting on you for this one.</p>}
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New request</DialogTitle></DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <select name="type" defaultValue="other" className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                {CLIENT_REQUEST_TYPES.map((t) => <option key={t} value={t}>{REQUEST_TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Priority</Label>
                <select name="priority" defaultValue="medium" className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                  {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
                </select>
              </div>
              {projects.length > 0 && (
                <div className="space-y-1">
                  <Label>Project</Label>
                  <select name="projectId" defaultValue="" className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                    <option value="">General</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>What do you need? *</Label>
              <textarea name="description" required rows={4} maxLength={3000} className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm" />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send request"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
