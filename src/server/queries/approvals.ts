import "server-only";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { approvals, profiles, clients, projects, leads, tasks } from "@/lib/db/schema";

const requester = alias(profiles, "requester");
const resolver = alias(profiles, "resolver");

function selectShape() {
  return {
    id: approvals.id,
    title: approvals.title,
    description: approvals.description,
    type: approvals.type,
    status: approvals.status,
    riskSummary: approvals.riskSummary,
    requestedAction: approvals.requestedAction,
    resolutionNotes: approvals.resolutionNotes,
    requestedByName: requester.name,
    resolvedByName: resolver.name,
    clientId: approvals.clientId,
    clientName: clients.name,
    projectId: approvals.projectId,
    projectName: projects.name,
    leadId: approvals.leadId,
    leadCompany: leads.company,
    taskId: approvals.taskId,
    taskTitle: tasks.title,
    createdAt: approvals.createdAt,
    resolvedAt: approvals.resolvedAt,
  };
}

export type ApprovalRow = Awaited<ReturnType<typeof listApprovals>>[number];

/** Pending first (oldest first within that — first-raised, first-seen),
 * then everything else newest first. */
export async function listApprovals(workspaceId: string) {
  return db
    .select(selectShape())
    .from(approvals)
    .leftJoin(requester, eq(approvals.requestedBy, requester.id))
    .leftJoin(resolver, eq(approvals.resolvedBy, resolver.id))
    .leftJoin(clients, eq(approvals.clientId, clients.id))
    .leftJoin(projects, eq(approvals.projectId, projects.id))
    .leftJoin(leads, eq(approvals.leadId, leads.id))
    .leftJoin(tasks, eq(approvals.taskId, tasks.id))
    .where(eq(approvals.workspaceId, workspaceId))
    .orderBy(sql`case when ${approvals.status} = 'pending' then 0 else 1 end`, desc(approvals.createdAt));
}

export async function getApproval(workspaceId: string, id: string) {
  const [row] = await db
    .select(selectShape())
    .from(approvals)
    .leftJoin(requester, eq(approvals.requestedBy, requester.id))
    .leftJoin(resolver, eq(approvals.resolvedBy, resolver.id))
    .leftJoin(clients, eq(approvals.clientId, clients.id))
    .leftJoin(projects, eq(approvals.projectId, projects.id))
    .leftJoin(leads, eq(approvals.leadId, leads.id))
    .leftJoin(tasks, eq(approvals.taskId, tasks.id))
    .where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.id, id)));
  return row;
}

export async function countPendingApprovals(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<string>`count(*)` })
    .from(approvals)
    .where(and(eq(approvals.workspaceId, workspaceId), eq(approvals.status, "pending")));
  return Number(row?.n ?? 0);
}
