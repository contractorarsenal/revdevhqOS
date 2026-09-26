import { db } from "@/lib/db";
import { authorizePortal } from "@/server/portal-authorize";
import { listClientLeads, listEligibleAssignees } from "@/server/queries/client-leads";
import { hasPortalRole } from "@/lib/portal";
import { ClientLeadsView } from "@/features/portal/client-leads-view";

export default async function ClientPortalLeadsPage() {
  const ctx = await authorizePortal("client_read_only");
  const canManage = hasPortalRole(ctx.membership.role, "client_member");
  const [leads, assignees] = await Promise.all([
    listClientLeads(db, ctx.membership.workspaceId, ctx.membership.clientId),
    listEligibleAssignees(db, ctx.membership.workspaceId, ctx.membership.clientId),
  ]);
  return <ClientLeadsView leads={leads} assignees={assignees} canManage={canManage} />;
}
