import { db } from "@/lib/db";
import { authorizePortal } from "@/server/portal-authorize";
import { listClientLeads, listEligibleAssignees } from "@/server/queries/client-leads";
import { hasPortalRole } from "@/lib/portal";
import { PortalShell } from "@/features/portal/portal-shell";
import { ClientLeadsView } from "@/features/portal/client-leads-view";
import { resolveClientAccent } from "@/lib/portal";

// Date-sensitive (received-at ordering, "needs response" age emphasis) and
// mutation-heavy — never statically frozen.
export const dynamic = "force-dynamic";

export default async function PortalLeadsPage() {
  const ctx = await authorizePortal("client_read_only");
  const accent = resolveClientAccent(ctx.client);
  const canManage = hasPortalRole(ctx.membership.role, "client_member");

  const [leads, assignees] = await Promise.all([
    listClientLeads(db, ctx.membership.workspaceId, ctx.membership.clientId),
    listEligibleAssignees(db, ctx.membership.workspaceId, ctx.membership.clientId),
  ]);

  return (
    <PortalShell businessName={ctx.client.name} accent={accent} userName={ctx.user.name}>
      <ClientLeadsView leads={leads} assignees={assignees} canManage={canManage} />
    </PortalShell>
  );
}
