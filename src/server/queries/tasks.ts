import "server-only";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, users, clients, leads, opportunities } from "@/lib/db/schema";

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
      assigneeName: users.name,
      clientId: tasks.clientId,
      clientName: clients.name,
      leadId: tasks.leadId,
      leadCompany: leads.company,
      opportunityId: tasks.opportunityId,
      opportunityName: opportunities.name,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .leftJoin(clients, eq(tasks.clientId, clients.id))
    .leftJoin(leads, eq(tasks.leadId, leads.id))
    .leftJoin(opportunities, eq(tasks.opportunityId, opportunities.id))
    .where(eq(tasks.workspaceId, workspaceId))
    .orderBy(desc(tasks.createdAt));
}
