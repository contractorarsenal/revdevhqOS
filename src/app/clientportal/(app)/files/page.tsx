import { db } from "@/lib/db";
import { authorizePortal } from "@/server/portal-authorize";
import { listPortalFiles, listPortalProjects } from "@/server/queries/portal-data";
import { hasPortalRole } from "@/lib/portal";
import { PortalFilesView } from "@/features/clientportal/files-view";

export default async function ClientPortalFilesPage() {
  const ctx = await authorizePortal("client_read_only");
  const scope = { workspaceId: ctx.membership.workspaceId, clientId: ctx.membership.clientId };
  const [files, projects] = await Promise.all([listPortalFiles(db, scope), listPortalProjects(db, scope)]);
  return (
    <PortalFilesView
      files={files}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      canUpload={hasPortalRole(ctx.membership.role, "client_member")}
    />
  );
}
