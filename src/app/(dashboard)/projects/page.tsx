import { requireWorkspace } from "@/lib/auth/session";
import { listProjects } from "@/server/queries/projects";
import { listMembers } from "@/server/queries/members";
import { listClients } from "@/server/queries/clients";
import { ProjectsView } from "@/features/projects/projects-view";

export default async function ProjectsPage() {
  const ctx = await requireWorkspace();
  const [projects, members, clients] = await Promise.all([
    listProjects(ctx.workspace.id, true),
    listMembers(ctx.workspace.id),
    listClients(ctx.workspace.id),
  ]);
  return (
    <ProjectsView
      projects={projects}
      members={members.map((m) => ({ userId: m.userId, name: m.name }))}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
