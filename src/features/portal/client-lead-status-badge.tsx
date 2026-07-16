import { CLIENT_LEAD_STATUS_LABEL, CLIENT_LEAD_STATUS_STYLE, type ClientLeadStatus } from "@/lib/leads-client";
import { cn } from "@/lib/utils";

export function ClientLeadStatusBadge({ status, className }: { status: ClientLeadStatus; className?: string }) {
  const style = CLIENT_LEAD_STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", style.badge, className)}>
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      {CLIENT_LEAD_STATUS_LABEL[status]}
    </span>
  );
}
