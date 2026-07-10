import { requireWorkspace } from "@/lib/auth/session";
import { listTasks } from "@/server/queries/tasks";
import { listMembers } from "@/server/queries/members";
import { listClients } from "@/server/queries/clients";
import { listLeads } from "@/server/queries/leads";
import { listPipeline } from "@/server/queries/pipeline";
import { listProjects } from "@/server/queries/projects";
import { todayInTimezone } from "@/lib/date-tz";
import { resolveTasksView } from "@/lib/view-defaults";
import { TasksView } from "@/features/tasks/tasks-view";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; view?: string; open?: string }>;
}) {
  const ctx = await requireWorkspace();
  const [tasks, members, clients, leads, pipeline, projects] = await Promise.all([
    listTasks(ctx.workspace.id),
    listMembers(ctx.workspace.id),
    listClients(ctx.workspace.id),
    listLeads(ctx.workspace.id),
    listPipeline(ctx.workspace.id),
    listProjects(ctx.workspace.id),
  ]);
  const params = await searchParams;
  const initialView = resolveTasksView(params.view);
  return (
    <TasksView
      tasks={tasks}
      currentUserId={ctx.user.id}
      today={todayInTimezone(ctx.workspace.timezone)}
      options={{
        members,
        clients: clients.map((c) => ({ id: c.id, name: c.name })),
        leads: leads.map((l) => ({ id: l.id, company: l.company })),
        opportunities: pipeline.flatMap((s) => s.opportunities.map((o) => ({ id: o.id, name: o.name }))),
        projects: projects.map((p) => ({ id: p.id, name: p.name })),
      }}
      openNew={params.new === "1"}
      initialView={initialView}
      openTaskId={params.open}
    />
  );
}
