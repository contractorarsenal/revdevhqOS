import { formatDistanceToNow } from "date-fns";

const ACTION_LABELS: Record<string, string> = {
  "client.created": "created the client",
  "client.updated": "updated the client",
  "client.archived": "archived the client",
  "contact.added": "added a contact",
  "lead.created": "created the lead",
  "lead.lost": "marked the lead lost",
  "lead.converted_to_opportunity": "converted the lead to an opportunity",
  "opportunity.created": "created an opportunity",
  "opportunity.moved": "moved an opportunity",
  "opportunity.won": "won an opportunity",
  "opportunity.lost": "lost an opportunity",
  "subscription.created": "created a subscription",
  "subscription.paused": "paused a subscription",
  "subscription.resumed": "resumed a subscription",
  "subscription.canceled": "canceled a subscription",
  "invoice.created": "created an invoice",
  "payment.recorded": "recorded a payment",
  "payment.voided": "removed a payment",
  "task.completed": "completed a task",
  "note.added": "added a note",
  "project.created": "created a project",
  "project.stage_changed": "moved a project to a new stage",
  "project.waiting_on_changed": "changed what a project is waiting on",
  "project.next_action_changed": "updated a project's next action",
  "project.update_posted": "posted a project update",
  "project.archived": "archived a project",
  "lead.status_changed": "changed a lead's status",
  "client_request.created": "logged a client request",
  "client_request.status_changed": "updated a client request",
  "client_request.triaged": "turned a client request into a task",
  "client_lead.created": "received a new website lead",
  "client_lead.status_changed": "updated a client lead",
  "client_file.uploaded": "uploaded a client file",
  "approval.requested": "sent something to Needs Jay",
  "approval.resolved": "resolved a Needs Jay item",
  "payment.updated": "edited a payment",
  "payment.restored": "restored a payment",
  "member.invited": "invited a team member",
};

export type ActivityItem = {
  id: string;
  action: string;
  metadata?: unknown;
  createdAt: Date | string;
  actorName: string | null;
};

export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="px-1 py-3 text-xs text-muted-foreground">No activity yet.</p>;
  }
  return (
    <ol className="space-y-0">
      {items.map((item, i) => {
        const meta = (item.metadata ?? {}) as Record<string, unknown>;
        const detail = meta.name ?? meta.company ?? meta.title ?? meta.service ?? meta.number ?? meta.to ?? meta.convertedTo;
        return (
          <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < items.length - 1 && (
              <span className="absolute left-[9px] top-5 bottom-0 w-px bg-border" aria-hidden />
            )}
            <span className="z-10 mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full bg-muted">
              <span className="size-1.5 rounded-full bg-primary" />
            </span>
            <div className="min-w-0 text-xs leading-relaxed">
              <p>
                <span className="font-semibold">{item.actorName ?? "Someone"}</span>{" "}
                {ACTION_LABELS[item.action] ?? item.action.replace(/[._]/g, " ")}
                {detail ? <span className="text-muted-foreground"> — {String(detail)}</span> : null}
                {typeof meta.amount === "number" ? (
                  <span className="tabular-nums font-semibold"> ${Number(meta.amount).toLocaleString()}</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
