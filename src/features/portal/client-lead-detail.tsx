"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Phone, MessageSquare, Mail, Save } from "lucide-react";
import { DetailDrawer } from "@/components/shared/detail-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/finance/metrics";
import {
  CLIENT_LEAD_STATUSES, CLIENT_LEAD_STATUS_LABEL, telHref, smsHref, mailtoHref,
  type ClientLeadStatus,
} from "@/lib/leads-client";
import type { ClientLeadRow, EligibleAssignee } from "@/server/queries/client-leads";
import {
  updateClientLeadStatus, assignClientLead, updateClientLeadEstimate,
  updateClientLeadClosedValue, addClientLeadNote,
} from "@/server/actions/client-leads";
import { ClientLeadStatusBadge } from "./client-lead-status-badge";

export function ClientLeadDetail({
  lead, assignees, canManage, open, onOpenChange,
}: {
  lead: ClientLeadRow | null;
  assignees: EligibleAssignee[];
  canManage: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DetailDrawer
      open={open && Boolean(lead)}
      onOpenChange={onOpenChange}
      title={lead ? <span className="flex items-center gap-2.5">{lead.name ?? "Lead"} <ClientLeadStatusBadge status={lead.status as ClientLeadStatus} /></span> : ""}
      description={lead?.requestedService ?? undefined}
    >
      {lead && <ClientLeadDetailBody lead={lead} assignees={assignees} canManage={canManage} />}
    </DetailDrawer>
  );
}

function ClientLeadDetailBody({
  lead, assignees, canManage,
}: {
  lead: ClientLeadRow;
  assignees: EligibleAssignee[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [estimateInput, setEstimateInput] = useState("");
  const [closedInput, setClosedInput] = useState("");
  const [noteInput, setNoteInput] = useState("");

  async function run(promise: Promise<{ ok: boolean; error?: string }>, success: string) {
    setPending(true);
    const result = await promise;
    setPending(false);
    if (!result.ok) return toast.error(result.error ?? "Action failed");
    toast.success(success);
    router.refresh();
  }

  const timeline = [
    { label: "Created", at: lead.createdAt },
    { label: "Contacted", at: lead.contactedAt },
    { label: "Estimate scheduled", at: lead.estimateScheduledAt },
    { label: lead.status === "lost" ? "Lost" : "Won", at: lead.wonAt ?? lead.lostAt },
  ].filter((t): t is { label: string; at: Date } => Boolean(t.at));

  const tel = telHref(lead.phone);
  const sms = smsHref(lead.phone);
  const mailto = mailtoHref(lead.email);

  return (
    <>
      {/* Quick actions — large tap targets for mobile */}
      <div className="flex gap-2">
        {tel && (
          <Button asChild variant="outline" size="sm" className="h-10 flex-1 gap-1.5">
            <a href={tel}><Phone className="size-4" /> Call</a>
          </Button>
        )}
        {sms && (
          <Button asChild variant="outline" size="sm" className="h-10 flex-1 gap-1.5">
            <a href={sms}><MessageSquare className="size-4" /> Text</a>
          </Button>
        )}
        {mailto && (
          <Button asChild variant="outline" size="sm" className="h-10 flex-1 gap-1.5">
            <a href={mailto}><Mail className="size-4" /> Email</a>
          </Button>
        )}
      </div>

      <div>
        <h4 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Contact</h4>
        <dl className="space-y-1 text-[12.5px]">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Name</dt><dd className="font-medium">{lead.name ?? "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Phone</dt><dd>{lead.phone ?? "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Email</dt><dd className="truncate">{lead.email ?? "—"}</dd></div>
        </dl>
      </div>

      <div>
        <h4 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Request</h4>
        <dl className="space-y-1 text-[12.5px]">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Service</dt><dd>{lead.requestedService ?? "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Source</dt><dd>{lead.source ?? "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Received</dt><dd>{format(new Date(lead.receivedAt), "MMM d, yyyy h:mm a")}</dd></div>
        </dl>
      </div>

      <div>
        <h4 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Management</h4>
        <div className="space-y-2.5">
          <div className="space-y-1">
            <Label className="text-[11px]">Status</Label>
            <select
              disabled={!canManage || pending}
              value={lead.status}
              onChange={(e) => run(updateClientLeadStatus(lead.id, { status: e.target.value as ClientLeadStatus }), "Status updated")}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm disabled:opacity-60"
            >
              {CLIENT_LEAD_STATUSES.map((s) => <option key={s} value={s}>{CLIENT_LEAD_STATUS_LABEL[s]}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Assigned to</Label>
            <select
              disabled={!canManage || pending}
              value={lead.assignedToId ?? ""}
              onChange={(e) => run(assignClientLead(lead.id, { profileId: e.target.value || null }), "Assignment updated")}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm disabled:opacity-60"
            >
              <option value="">Unassigned</option>
              {assignees.map((a) => <option key={a.profileId} value={a.profileId}>{a.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label className="text-[11px]">Estimated value</Label>
              <div className="flex gap-1.5">
                <Input
                  type="number" step="0.01" min="0" disabled={!canManage} placeholder={lead.estimatedValue ?? "0"}
                  value={estimateInput} onChange={(e) => setEstimateInput(e.target.value)}
                  className="h-9"
                />
                <Button
                  size="icon" variant="outline" className="size-9 shrink-0" disabled={!canManage || pending || estimateInput === ""}
                  onClick={() => { run(updateClientLeadEstimate(lead.id, { estimatedValue: estimateInput }), "Estimate updated"); setEstimateInput(""); }}
                >
                  <Save className="size-3.5" />
                </Button>
              </div>
              {lead.estimatedValue && <p className="text-[11px] text-muted-foreground">Current: {formatMoney(lead.estimatedValue)}</p>}
            </div>

            {lead.status === "won" && (
              <div className="space-y-1">
                <Label className="text-[11px]">Closed value</Label>
                <div className="flex gap-1.5">
                  <Input
                    type="number" step="0.01" min="0" disabled={!canManage} placeholder={lead.closedValue ?? "0"}
                    value={closedInput} onChange={(e) => setClosedInput(e.target.value)}
                    className="h-9"
                  />
                  <Button
                    size="icon" variant="outline" className="size-9 shrink-0" disabled={!canManage || pending || closedInput === ""}
                    onClick={() => { run(updateClientLeadClosedValue(lead.id, { closedValue: closedInput }), "Closed value updated"); setClosedInput(""); }}
                  >
                    <Save className="size-3.5" />
                  </Button>
                </div>
                {lead.closedValue && <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Confirmed: {formatMoney(lead.closedValue)}</p>}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Notes</Label>
            {lead.notes && <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2.5 text-[12px] text-muted-foreground">{lead.notes}</p>}
            {canManage && (
              <div className="flex gap-1.5">
                <Textarea value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="Add a note…" className="min-h-9 text-sm" rows={2} />
                <Button
                  size="icon" variant="outline" className="size-9 shrink-0 self-end" disabled={pending || !noteInput.trim()}
                  onClick={() => { run(addClientLeadNote(lead.id, { note: noteInput }), "Note added"); setNoteInput(""); }}
                >
                  <Save className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {timeline.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Timeline</h4>
          <ul className="space-y-1.5 text-[12px]">
            {timeline.map((t) => (
              <li key={t.label} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t.label}</span>
                <span>{format(new Date(t.at), "MMM d, yyyy h:mm a")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
