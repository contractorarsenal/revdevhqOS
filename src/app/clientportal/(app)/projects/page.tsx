import { db } from "@/lib/db";
import { authorizePortal } from "@/server/portal-authorize";
import { listPortalProjects } from "@/server/queries/portal-data";
import { PortalProjectsView } from "@/features/clientportal/projects-view";

export default async function ClientPortalProjectsPage() {
  const ctx = await authorizePortal("client_read_only");
  const projects = await listPortalProjects(db, { workspaceId: ctx.membership.workspaceId, clientId: ctx.membership.clientId });
  return <PortalProjectsView projects={projects} />;
}
