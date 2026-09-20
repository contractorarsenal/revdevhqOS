import { authorizePortal } from "@/server/portal-authorize";
import { listClientRequestsForClient } from "@/server/queries/client-requests";
import { hasPortalRole, resolveClientAccent } from "@/lib/portal";
import { PortalShell } from "@/features/portal/portal-shell";
import { PortalRequestsView } from "@/features/portal/portal-requests-view";

export const dynamic = "force-dynamic";

export default async function PortalRequestsPage() {
  const ctx = await authorizePortal("client_read_only");
  const accent = resolveClientAccent(ctx.client);
  const canSubmit = hasPortalRole(ctx.membership.role, "client_member");

  const requests = await listClientRequestsForClient(ctx.membership.workspaceId, ctx.membership.clientId);

  return (
    <PortalShell businessName={ctx.client.name} accent={accent} userName={ctx.user.name}>
      <PortalRequestsView requests={requests} canSubmit={canSubmit} />
    </PortalShell>
  );
}
