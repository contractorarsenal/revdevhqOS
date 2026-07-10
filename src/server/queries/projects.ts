import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { calculateProjectProgress } from "@/lib/calendar-feed";
import { db } from "@/lib/db";
import { projects, tasks, profiles, clients } from "@/lib/db/schema";

export async function listProjects(workspaceId: string, includeArchived = false) {
  const rows = await db
    .select({
      id: projects.id, name: projects.name, description: projects.description, status: projects.status,
      ownerId: projects.ownerId, ownerName: profiles.name, clientId: projects.clientId, clientName: clients.name,
      startDate: projects.startDate, dueDate: projects.dueDate, color: projects.color, createdAt: projects.createdAt,
    })
    .from(projects)
    .leftJoin(profiles, eq(projects.ownerId, profiles.id))
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .where(
      includeArchived
        ? eq(projects.workspaceId, workspaceId)
        : and(eq(projects.workspaceId, workspaceId), ne(projects.status, "archived"))
    )
    .orderBy(projects.createdAt);

  if (rows.length === 0) return [];
  const counts = await db
    .select({
      projectId: tasks.projectId,
      total: sql<number>`count(*)`,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')`,
    })
    .from(tasks)
    .where(eq(tasks.workspaceId, workspaceId))
    .groupBy(tasks.projectId);
  const countMap = new Map(counts.filter((c) => c.projectId).map((c) => [c.projectId as string, c]));

  return rows.map((p) => {
    const c = countMap.get(p.id);
    const total = c ? Number(c.total) : 0;
    const completed = c ? Number(c.completed) : 0;
    return { ...p, taskCount: total, completedCount: completed, progress: calculateProjectProgress(total, completed) };
  });
}

export async function getProjectDetail(workspaceId: string, projectId: string) {
  const [project] = await db
    .select({
      id: projects.id, name: projects.name, description: projects.description, status: projects.status,
      ownerId: projects.ownerId, ownerName: profiles.name, clientId: projects.clientId, clientName: clients.name,
      startDate: projects.startDate, dueDate: projects.dueDate, color: projects.color, createdAt: projects.createdAt,
    })
    .from(projects)
    .leftJoin(profiles, eq(projects.ownerId, profiles.id))
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  if (!project) return null;

  const projectTasks = await db
    .select({
      id: tasks.id, title: tasks.title, status: tasks.status, priority: tasks.priority,
      dueDate: tasks.dueDate, scheduledDate: tasks.scheduledDate, assigneeId: tasks.assigneeId, assigneeName: profiles.name,
    })
    .from(tasks)
    .leftJoin(profiles, eq(tasks.assigneeId, profiles.id))
    .where(and(eq(tasks.projectId, projectId), eq(tasks.workspaceId, workspaceId)))
    .orderBy(tasks.createdAt);

  const completed = projectTasks.filter((t) => t.status === "completed").length;
  const upcoming = projectTasks.filter((t) => t.scheduledDate && t.status !== "completed" && t.status !== "canceled");

  return {
    project,
    tasks: projectTasks,
    taskCount: projectTasks.length,
    completedCount: completed,
    progress: calculateProjectProgress(projectTasks.length, completed),
    upcoming,
  };
}
