import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getProjectDetail } from "@/server/queries/projects";
import { listMembers } from "@/server/queries/members";
import { listClients } from "@/server/queries/clients";
import { ProjectDetailView } from "@/features/projects/project-detail-view";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace();
  const [detail, members, clients] = await Promise.all([
    getProjectDetail(ctx.workspace.id, id),
    listMembers(ctx.workspace.id),
    listClients(ctx.workspace.id),
  ]);
  if (!detail) notFound();
  return (
    <ProjectDetailView
      detail={detail}
      members={members.map((m) => ({ userId: m.userId, name: m.name }))}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
