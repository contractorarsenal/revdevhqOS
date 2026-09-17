import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientRequests, clients, profiles, tasks } from "@/lib/db/schema";

function selectShape() {
  return {
    id: clientRequests.id,
    clientId: clientRequests.clientId,
    clientName: clients.name,
    type: clientRequests.type,
    status: clientRequests.status,
    description: clientRequests.description,
    priority: clientRequests.priority,
    submittedByName: profiles.name,
    taskId: clientRequests.taskId,
    taskTitle: tasks.title,
    resolutionNotes: clientRequests.resolutionNotes,
    createdAt: clientRequests.createdAt,
    updatedAt: clientRequests.updatedAt,
  };
}

export type ClientRequestRow = Awaited<ReturnType<typeof listClientRequests>>[number];

/** All client requests across the workspace — newest open first. */
export async function listClientRequests(workspaceId: string) {
  return db
    .select(selectShape())
    .from(clientRequests)
    .leftJoin(clients, eq(clientRequests.clientId, clients.id))
    .leftJoin(profiles, eq(clientRequests.submittedBy, profiles.id))
    .leftJoin(tasks, eq(clientRequests.taskId, tasks.id))
    .where(eq(clientRequests.workspaceId, workspaceId))
    .orderBy(sql`case when ${clientRequests.status} = 'complete' or ${clientRequests.status} = 'client_notified' then 1 else 0 end desc`, desc(clientRequests.createdAt));
}

/** One client's own requests — used by both the internal client detail page
 * and the client portal. */
export async function listClientRequestsForClient(workspaceId: string, clientId: string) {
  return db
    .select(selectShape())
    .from(clientRequests)
    .leftJoin(clients, eq(clientRequests.clientId, clients.id))
    .leftJoin(profiles, eq(clientRequests.submittedBy, profiles.id))
    .leftJoin(tasks, eq(clientRequests.taskId, tasks.id))
    .where(and(eq(clientRequests.workspaceId, workspaceId), eq(clientRequests.clientId, clientId)))
    .orderBy(desc(clientRequests.createdAt));
}

export async function countOpenClientRequests(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<string>`count(*)` })
    .from(clientRequests)
    .where(and(
      eq(clientRequests.workspaceId, workspaceId),
      sql`${clientRequests.status} not in ('complete', 'client_notified')`
    ));
  return Number(row?.n ?? 0);
}
