import "server-only";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { pipelineStages, opportunities, profiles } from "@/lib/db/schema";

export type StageWithOpps = Awaited<ReturnType<typeof listPipeline>>[number];

export async function listStages(workspaceId: string) {
  return db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.workspaceId, workspaceId))
    .orderBy(pipelineStages.position);
}

export async function listPipeline(workspaceId: string) {
  const stages = await listStages(workspaceId);
  const opps = await db
    .select({
      id: opportunities.id,
      stageId: opportunities.stageId,
      name: opportunities.name,
      contactName: opportunities.contactName,
      value: opportunities.value,
      mrr: opportunities.mrr,
      status: opportunities.status,
      ownerId: opportunities.ownerId,
      ownerName: profiles.name,
      expectedCloseDate: opportunities.expectedCloseDate,
      leadId: opportunities.leadId,
      clientId: opportunities.clientId,
      createdAt: opportunities.createdAt,
    })
    .from(opportunities)
    .leftJoin(profiles, eq(opportunities.ownerId, profiles.id))
    .where(eq(opportunities.workspaceId, workspaceId))
    .orderBy(desc(opportunities.createdAt));

  return stages.map((stage) => ({
    ...stage,
    opportunities: opps.filter((o) => o.stageId === stage.id),
  }));
}
