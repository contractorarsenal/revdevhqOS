import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { authorizePortal } from "@/server/portal-authorize";
import { getPortalProject } from "@/server/queries/portal-data";
import { PortalProjectDetail } from "@/features/clientportal/project-detail-view";

export default async function ClientPortalProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await authorizePortal("client_read_only");
  // Scope comes from the session; the URL id is only ever a lookup key inside
  // that scope, so another client's project id resolves to a plain 404.
  const project = await getPortalProject(db, { workspaceId: ctx.membership.workspaceId, clientId: ctx.membership.clientId }, id);
  if (!project) notFound();
  return <PortalProjectDetail project={project} />;
}
