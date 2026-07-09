import { requireWorkspace } from "@/lib/auth/session";
import { listPipeline } from "@/server/queries/pipeline";
import { listMembers } from "@/server/queries/members";
import { listServices } from "@/server/queries/billing";
import { listLeads } from "@/server/queries/leads";
import { PipelineView } from "@/features/pipeline/pipeline-view";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const ctx = await requireWorkspace();
  const [stages, members, services, leads] = await Promise.all([
    listPipeline(ctx.workspace.id),
    listMembers(ctx.workspace.id),
    listServices(ctx.workspace.id),
    listLeads(ctx.workspace.id),
  ]);
  const params = await searchParams;
  return (
    <PipelineView
      stages={stages}
      members={members}
      services={services}
      leads={leads.map((l) => ({ id: l.id, company: l.company }))}
      openNew={params.new === "1"}
    />
  );
}
