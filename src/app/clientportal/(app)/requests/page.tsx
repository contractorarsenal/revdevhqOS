import { db } from "@/lib/db";
import { authorizePortal } from "@/server/portal-authorize";
import { listPortalProjects, listPortalRequests } from "@/server/queries/portal-data";
import { hasPortalRole } from "@/lib/portal";
import { PortalRequestsView } from "@/features/clientportal/requests-view";

export default async function ClientPortalRequestsPage() {
  const ctx = await authorizePortal("client_read_only");
  const scope = { workspaceId: ctx.membership.workspaceId, clientId: ctx.membership.clientId };
  const [requests, projects] = await Promise.all([listPortalRequests(db, scope), listPortalProjects(db, scope)]);
  return (
    <PortalRequestsView
      requests={requests}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      canSubmit={hasPortalRole(ctx.membership.role, "client_member")}
    />
  );
}
