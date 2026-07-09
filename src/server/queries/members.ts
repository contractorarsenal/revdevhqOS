import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceMembers, users } from "@/lib/db/schema";

export async function listMembers(workspaceId: string) {
  return db
    .select({
      id: workspaceMembers.id,
      role: workspaceMembers.role,
      userId: users.id,
      name: users.name,
      email: users.email,
      joinedAt: workspaceMembers.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(workspaceMembers.createdAt);
}
