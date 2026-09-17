"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Gavel, Plus } from "lucide-react";
import { createApproval, resolveApproval } from "@/server/actions/approvals";
import { APPROVAL_TYPES } from "@/lib/validation";
import { canWrite, type WorkspaceRole } from "@/lib/permissions";
import type { ApprovalRow } from "@/server/queries/approvals";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const TYPE_LABEL: Record<(typeof APPROVAL_TYPES)[number], string> = {
  pricing: "Pricing",
  deployment: "Deployment",
  payment_issue: "Payment issue",
  refund_cancellation: "Refund / cancellation",
  client_issue: "Client issue",
  scope_decision: "Scope decision",
  security: "Security",
  blocker: "Blocker",
  other: "Other",
};

const RESOLUTIONS = [
  { status: "approved", label: "Approve" },
  { status: "declined", label: "Decline" },
  { status: "resolved", label: "Mark resolved" },
  { status: "cancelled", label: "Cancel" },
] as const;

export function ApprovalsView({ items, role }: { items: ApprovalRow[]; role: WorkspaceRole }) {
  const router = useRouter();
  const isOwner = role === "owner";
  const canRequest = canWrite(role);
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<{ id: string; status: (typeof RESOLUTIONS)[number]["status"] } | null>(null);

  const pendingItems = items.filter((i) => i.status === "pending");
  const decidedItems = items.filter((i) => i.status !== "pending");

  function submitCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createApproval({
        title: String(form.get("title")),
        type: String(form.get("type")),
        description: String(form.get("description") ?? ""),
        riskSummary: String(form.get("riskSummary") ?? ""),
        requestedAction: String(form.get("requestedAction") ?? ""),
      });
      if (!result.ok) return setCreateError(result.error);
      toast.success("Sent to Needs Jay");
      setCreateOpen(false);
      router.refresh();
    });
  }

  function submitResolve(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resolveTarget) return;
    const form = new FormData(e.currentTarget);
    const target = resolveTarget;
    startTransition(async () => {
      const result = await resolveApproval(target.id, {
        status: target.status,
        resolutionNotes: String(form.get("resolutionNotes") ?? ""),
      });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success("Updated");
      setResolveTarget(null);
      router.refresh();
    });
  }

  return (
    <div>
      <PageHeader title="Needs Jay" description="Decisions and actions that need an owner's call.">
        {canRequest && (
          <Button size="sm" className="gap-1.5" onClick={() => { setCreateError(null); setCreateOpen(true); }}>
            <Plus className="size-3.5" /> Request approval
          </Button>
        )}
      </PageHeader>

      {pendingItems.length === 0 ? (
        <EmptyState icon={Gavel} title="Nothing needs Jay right now" description="Requests that need an owner decision will show up here." />
      ) : (
        <div className="space-y-3">
          {pendingItems.map((item) => (
            <div key={item.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-semibold">{item.title}</p>
                    <StatusBadge status={item.type} tone="neutral" />
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    Requested by {item.requestedByName ?? "someone"} · {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    {item.clientName && ` · ${item.clientName}`}
                    {item.projectName && ` · ${item.projectName}`}
                    {item.leadCompany && ` · ${item.leadCompany}`}
                  </p>
                </div>
              </div>
              {item.description && <p className="mt-2 text-[12.5px]">{item.description}</p>}
              {item.riskSummary && (
                <p className="mt-2 text-[12px] text-destructive">
                  <span className="font-semibold">Risk: </span>{item.riskSummary}
                </p>
              )}
              {item.requestedAction && (
                <p className="mt-1 text-[12px] text-muted-foreground">
                  <span className="font-semibold text-foreground">Requested action: </span>{item.requestedAction}
                </p>
              )}
              {isOwner && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {RESOLUTIONS.map((r) => (
                    <Button
                      key={r.status} variant={r.status === "approved" ? "default" : "outline"} size="sm" className="h-7 px-2.5 text-xs"
                      onClick={() => setResolveTarget({ id: item.id, status: r.status })}
                    >
                      {r.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {decidedItems.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[12px] font-semibold text-muted-foreground">Recently decided</h2>
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            {decidedItems.slice(0, 20).map((item) => (
              <div key={item.id} className="flex items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {item.resolvedByName && `${item.resolvedByName} · `}
                    {item.resolvedAt && formatDistanceToNow(new Date(item.resolvedAt), { addSuffix: true })}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        </section>
      )}

      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request approval</DialogTitle>
            <DialogDescription>Only genuine decisions the owner needs to make — not a status update.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCreate} className="space-y-3">
            <div className="space-y-1">
              <Label>Title *</Label>
              <Input name="title" required placeholder="Refund request from Acme Roofing" />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <select name="type" defaultValue="other" className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                {APPROVAL_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <textarea name="description" rows={2} className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm" />
            </div>
            <div className="space-y-1">
              <Label>Risk (if any)</Label>
              <Input name="riskSummary" placeholder="Client may churn if we say no" />
            </div>
            <div className="space-y-1">
              <Label>Requested action</Label>
              <Input name="requestedAction" placeholder="Approve a $200 refund" />
            </div>
            {createError && <p className="text-xs text-destructive">{createError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send to Needs Jay"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resolveTarget)} onOpenChange={(o) => !o && setResolveTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{RESOLUTIONS.find((r) => r.status === resolveTarget?.status)?.label}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitResolve} className="space-y-3">
            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <textarea name="resolutionNotes" rows={3} className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResolveTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Confirm"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
