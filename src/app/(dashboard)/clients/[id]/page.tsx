import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getClientDetail } from "@/server/queries/clients";
import { getClientBillingSummary } from "@/server/queries/client-billing";
import { listMembers } from "@/server/queries/members";
import { listServices } from "@/server/queries/billing";
import { getClientPortalAccess } from "@/server/queries/client-portal";
import { clientLeadSummary } from "@/server/queries/client-leads";
import { db } from "@/lib/db";
import { todayInTimezone } from "@/lib/date-tz";
import { canAdminister } from "@/lib/permissions";
import { ClientDetailView } from "@/features/clients/client-detail-view";

// Date-sensitive: days remaining, pace, and due states must be computed at
// request time in the workspace timezone — time moves even when no mutation
// fires a revalidation, so this page must never be statically frozen.
export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace();
  const [detail, billing, members, services, portalAccess, leadSummary] = await Promise.all([
    getClientDetail(ctx.workspace.id, id).catch(() => null),
    getClientBillingSummary(ctx.workspace.id, id, ctx.workspace.timezone),
    listMembers(ctx.workspace.id),
    listServices(ctx.workspace.id),
    getClientPortalAccess(ctx.workspace.id, id),
    clientLeadSummary(db, ctx.workspace.id, id, ctx.workspace.timezone, todayInTimezone(ctx.workspace.timezone)),
  ]);
  if (!detail) notFound();
  return (
    <ClientDetailView
      detail={detail}
      billing={billing}
      members={members}
      services={services}
      portalAccess={portalAccess}
      leadSummary={leadSummary}
      canManagePortal={canAdminister(ctx.role)}
    />
  );
}
