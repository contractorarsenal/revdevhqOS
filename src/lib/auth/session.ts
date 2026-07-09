import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles, workspaceMembers, workspaces } from "@/lib/db/schema";
import type { WorkspaceRole } from "@/lib/permissions";

export const ACTIVE_WORKSPACE_COOKIE = "rdhq-active-workspace";

/**
 * Infrastructure guard: when the app database is unreachable or not yet
 * migrated (fresh deployment), redirect to a controlled setup page instead
 * of crashing the server component. In development the original error is
 * rethrown so the real cause is visible.
 */
async function guardInfra<T>(operation: () => Promise<T>): Promise<T> {
  let result: { ok: true; value: T } | { ok: false; error: unknown };
  try {
    result = { ok: true, value: await operation() };
  } catch (error) {
    result = { ok: false, error };
  }
  if (result.ok) return result.value;
  console.error("[revdevhqOS] database unavailable:", result.error);
  if (process.env.NODE_ENV !== "production") throw result.error;
  redirect("/setup-required");
}

export type AppUser = { id: string; name: string; email: string };

/**
 * Validates the Supabase session server-side and guarantees an app profile
 * row exists for the user. Redirects to /sign-in when unauthenticated.
 * Cached per request.
 */
export const requireUser = cache(async (): Promise<AppUser> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const name =
    (user.user_metadata?.name as string | undefined)?.trim() ||
    user.email?.split("@")[0] ||
    "Member";
  const email = user.email ?? "";

  await guardInfra(() =>
    db
      .insert(profiles)
      .values({ id: user.id, name, email })
      .onConflictDoUpdate({ target: profiles.id, set: { email } })
  );

  return { id: user.id, name, email };
});

export type WorkspaceContext = {
  user: AppUser;
  workspace: typeof workspaces.$inferSelect;
  role: WorkspaceRole;
};

/**
 * Resolves the active workspace for the signed-in user and verifies
 * membership server-side. Every query and mutation goes through this.
 * Redirects to /setup when the user has no workspace yet.
 */
export const requireWorkspace = cache(async (): Promise<WorkspaceContext> => {
  const user = await requireUser();
  const cookieStore = await cookies();
  const preferred = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;

  const memberships = await guardInfra(() =>
    db
      .select({ member: workspaceMembers, workspace: workspaces })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, user.id))
  );

  if (memberships.length === 0) redirect("/setup");

  const active =
    (preferred && memberships.find((m) => m.workspace.id === preferred)) || memberships[0];

  return { user, workspace: active.workspace, role: active.member.role };
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
