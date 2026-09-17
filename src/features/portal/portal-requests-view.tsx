"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ClipboardList, Plus } from "lucide-react";
import { submitClientRequest } from "@/server/actions/portal-client-requests";
import { CLIENT_REQUEST_TYPES } from "@/lib/validation";
import { REQUEST_TYPE_LABEL } from "@/features/client-requests/client-requests-view";
import type { ClientRequestRow } from "@/server/queries/client-requests";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function PortalRequestsView({ requests, canSubmit }: { requests: ClientRequestRow[]; canSubmit: boolean }) {
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
        priority: "medium",
      });
      if (!result.ok) return setError(result.error);
      toast.success("Request sent");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div>
      <PageHeader title="Requests" description="Ask for a change, report a problem, or request support.">
        {canSubmit && (
          <Button size="sm" className="gap-1.5" onClick={() => { setError(null); setOpen(true); }}>
            <Plus className="size-3.5" /> New request
          </Button>
        )}
      </PageHeader>

      {requests.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No requests yet" description="Anything you ask for shows up here so you can track it." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          {requests.map((r) => (
            <div key={r.id} className="border-t border-border/40 px-4 py-3 first:border-t-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[12.5px] font-semibold">{REQUEST_TYPE_LABEL[r.type as (typeof CLIENT_REQUEST_TYPES)[number]]}</p>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">{r.description}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>New request</DialogTitle></DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <select name="type" defaultValue="other" className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                {CLIENT_REQUEST_TYPES.map((t) => <option key={t} value={t}>{REQUEST_TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>What do you need? *</Label>
              <textarea name="description" required rows={4} className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm" />
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
