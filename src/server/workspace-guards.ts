import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db as appDb } from "@/lib/db";
import {
  clients, leads, opportunities, tasks, pipelineStages, invoices, workspaceMembers, projects,
  clientPortalMemberships,
} from "@/lib/db/schema";

/**
 * Relationship guards: every client-provided related ID must be proven to
 * belong to the active workspace before it is written. Optional IDs
 * (null/undefined) pass. Failures throw a safe, generic message — never a
 * raw database error.
 *
 * `guardDeps.db` exists as a test seam so these run against an embedded
 * database in tests; production always uses the app database.
 */
export const guardDeps = { db: appDb };

type Id = string | null | undefined;

export async function assertWorkspaceMember(workspaceId: string, userId: Id): Promise<void> {
  if (!userId) return;
  const [row] = await guardDeps.db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  if (!row) throw new Error("That user is not a member of this workspace.");
}

export async function assertWorkspaceClient(workspaceId: string, clientId: Id): Promise<void> {
  if (!clientId) return;
  const [row] = await guardDeps.db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Client not found in this workspace.");
}

export async function assertWorkspaceLead(workspaceId: string, leadId: Id): Promise<void> {
  if (!leadId) return;
  const [row] = await guardDeps.db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Lead not found in this workspace.");
}

export async function assertWorkspaceOpportunity(workspaceId: string, opportunityId: Id): Promise<void> {
  if (!opportunityId) return;
  const [row] = await guardDeps.db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Opportunity not found in this workspace.");
}

export async function assertWorkspaceTask(workspaceId: string, taskId: Id): Promise<void> {
  if (!taskId) return;
  const [row] = await guardDeps.db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Task not found in this workspace.");
}

export async function assertWorkspacePipelineStage(workspaceId: string, stageId: Id): Promise<void> {
  if (!stageId) return;
  const [row] = await guardDeps.db
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Stage not found in this workspace.");
}

export async function assertWorkspaceInvoice(workspaceId: string, invoiceId: Id): Promise<void> {
  if (!invoiceId) return;
  const [row] = await guardDeps.db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Invoice not found in this workspace.");
}

export async function assertWorkspaceProject(workspaceId: string, projectId: Id): Promise<void> {
  if (!projectId) return;
  const [row] = await guardDeps.db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Project not found in this workspace.");
}

/**
 * Client-portal ownership guard: a lead must belong to BOTH the caller's
 * workspace AND their specific client — never workspace alone. This is the
 * one check that makes cross-client lead access structurally impossible for
 * every portal lead mutation. Throws a generic "not found" (never
 * distinguishing "wrong workspace" from "wrong client" from "doesn't
 * exist") so a client can't probe for other clients' lead ids.
 */
export async function assertClientOwnedLead(workspaceId: string, clientId: string, leadId: Id): Promise<void> {
  if (!leadId) throw new Error("Lead not found.");
  const [row] = await guardDeps.db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId), eq(leads.clientId, clientId), isNull(leads.archivedAt)))
    .limit(1);
  if (!row) throw new Error("Lead not found.");
}

/** An assignee must be an ACTIVE client_owner/client_member of the SAME
 * client — never a member of another client, never read-only, never a
 * suspended/revoked/invited membership. */
export async function assertClientEligibleAssignee(workspaceId: string, clientId: string, profileId: Id): Promise<void> {
  if (!profileId) return; // unassigning is always allowed
  const [row] = await guardDeps.db
    .select({ role: clientPortalMemberships.role })
    .from(clientPortalMemberships)
    .where(and(
      eq(clientPortalMemberships.profileId, profileId),
      eq(clientPortalMemberships.workspaceId, workspaceId),
      eq(clientPortalMemberships.clientId, clientId),
      eq(clientPortalMemberships.status, "active")
    ))
    .limit(1);
  if (!row || !["client_owner", "client_member"].includes(row.role)) {
    throw new Error("That person is not an eligible assignee for this client's leads.");
  }
}

/** Convenience: guard the standard task/note relation set in one call. */
export async function assertWorkspaceRelations(
  workspaceId: string,
  rel: { clientId?: Id; leadId?: Id; opportunityId?: Id; taskId?: Id; assigneeId?: Id; ownerId?: Id; projectId?: Id }
): Promise<void> {
  await Promise.all([
    assertWorkspaceClient(workspaceId, rel.clientId),
    assertWorkspaceLead(workspaceId, rel.leadId),
    assertWorkspaceOpportunity(workspaceId, rel.opportunityId),
    assertWorkspaceTask(workspaceId, rel.taskId),
    assertWorkspaceMember(workspaceId, rel.assigneeId),
    assertWorkspaceMember(workspaceId, rel.ownerId),
    assertWorkspaceProject(workspaceId, rel.projectId),
  ]);
}
