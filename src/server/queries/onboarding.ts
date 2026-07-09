import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientOnboarding, clients, users } from "@/lib/db/schema";

export async function listOnboarding(workspaceId: string) {
  const rows = await db
    .select({
      clientId: clients.id,
      clientName: clients.name,
      clientStatus: clients.status,
      ownerName: users.name,
      stepId: clientOnboarding.id,
      stepName: clientOnboarding.stepName,
      position: clientOnboarding.position,
      completedAt: clientOnboarding.completedAt,
      startedAt: clientOnboarding.createdAt,
    })
    .from(clientOnboarding)
    .innerJoin(clients, eq(clientOnboarding.clientId, clients.id))
    .leftJoin(users, eq(clients.ownerId, users.id))
    .where(and(eq(clientOnboarding.workspaceId, workspaceId), inArray(clients.status, ["onboarding", "active"])))
    .orderBy(clients.name, clientOnboarding.position);

  const byClient = new Map<string, {
    clientId: string; clientName: string; ownerName: string | null; startedAt: Date;
    steps: { id: string; name: string; position: number; completedAt: Date | null }[];
  }>();
  for (const r of rows) {
    const entry = byClient.get(r.clientId) ?? {
      clientId: r.clientId, clientName: r.clientName, ownerName: r.ownerName, startedAt: r.startedAt, steps: [],
    };
    entry.steps.push({ id: r.stepId, name: r.stepName, position: r.position, completedAt: r.completedAt });
    byClient.set(r.clientId, entry);
  }
  return [...byClient.values()];
}
