import "server-only";
import { cache } from "react";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaceMembers, workspaces } from "@/lib/db/schema";
import type { WorkspaceRole } from "@/lib/permissions";

export const ACTIVE_WORKSPACE_COOKIE = "rdhq-active-workspace";

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/** Redirects to /sign-in when there is no valid server-side session. */
export async function requireUser() {
  const session = await getSession();
  if (!session?.user) redirect("/sign-in");
  return session;
}

export type WorkspaceContext = {
  user: { id: string; name: string; email: string };
  workspace: typeof workspaces.$inferSelect;
  role: WorkspaceRole;
};

/**
 * Resolves the active workspace for the signed-in user and verifies
 * membership server-side. Every query and mutation goes through this.
 * Redirects to /setup when the user has no workspace yet.
 */
export const requireWorkspace = cache(async (): Promise<WorkspaceContext> => {
  const session = await requireUser();
  const userId = session.user.id;
  const cookieStore = await cookies();
  const preferred = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;

  const memberships = await db
    .select({ member: workspaceMembers, workspace: workspaces })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId));

  if (memberships.length === 0) redirect("/setup");

  const active =
    (preferred && memberships.find((m) => m.workspace.id === preferred)) || memberships[0];

  return {
    user: { id: userId, name: session.user.name, email: session.user.email },
    workspace: active.workspace,
    role: active.member.role,
  };
});

/** Verifies the user is a member of the given workspace (for explicit checks). */
export async function assertMembership(userId: string, workspaceId: string) {
  const [m] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)))
    .limit(1);
  if (!m) throw new Error("You do not have access to this workspace.");
  return m;
}
