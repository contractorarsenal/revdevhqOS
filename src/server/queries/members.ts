import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceMembers, profiles } from "@/lib/db/schema";

export async function listMembers(workspaceId: string) {
  return db
    .select({
      id: workspaceMembers.id,
      role: workspaceMembers.role,
      userId: profiles.id,
      name: profiles.name,
      email: profiles.email,
      joinedAt: workspaceMembers.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(profiles, eq(workspaceMembers.userId, profiles.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(workspaceMembers.createdAt);
}
