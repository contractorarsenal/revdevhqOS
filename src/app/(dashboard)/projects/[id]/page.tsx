import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getProjectDetail } from "@/server/queries/projects";
import { ProjectDetailView } from "@/features/projects/project-detail-view";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace();
  const detail = await getProjectDetail(ctx.workspace.id, id);
  if (!detail) notFound();
  return <ProjectDetailView detail={detail} />;
}
