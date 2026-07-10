import "server-only";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, profiles, clients, leads, opportunities, projects } from "@/lib/db/schema";

export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number];

export async function listTasks(workspaceId: string) {
  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      assigneeId: tasks.assigneeId,
      assigneeName: profiles.name,
      clientId: tasks.clientId,
      clientName: clients.name,
      leadId: tasks.leadId,
      leadCompany: leads.company,
      opportunityId: tasks.opportunityId,
      opportunityName: opportunities.name,
      projectId: tasks.projectId,
      projectName: projects.name,
      scheduledDate: tasks.scheduledDate,
      scheduledStartTime: tasks.scheduledStartTime,
      scheduledEndTime: tasks.scheduledEndTime,
      allDay: tasks.allDay,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .leftJoin(profiles, eq(tasks.assigneeId, profiles.id))
    .leftJoin(clients, eq(tasks.clientId, clients.id))
    .leftJoin(leads, eq(tasks.leadId, leads.id))
    .leftJoin(opportunities, eq(tasks.opportunityId, opportunities.id))
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(eq(tasks.workspaceId, workspaceId))
    .orderBy(desc(tasks.createdAt));
}
