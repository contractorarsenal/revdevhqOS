import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { clients, clientPortalMemberships, profiles, workspaceMembers, workspaces } from "@/lib/db/schema";
import type { WorkspaceRole } from "@/lib/permissions";
import { resolvePostLoginDestination, type ClientPortalRole, type ClientPortalStatus } from "@/lib/portal";

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

  // Read-first: a SELECT on every request is far cheaper than an upsert
  // write. The insert only happens on the user's first request (or if the
  // auth email changed).
  await guardInfra(async () => {
    const [existing] = await db
      .select({ id: profiles.id, email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    if (!existing) {
      await db
        .insert(profiles)
        .values({ id: user.id, name, email })
        .onConflictDoNothing({ target: profiles.id });
    } else if (existing.email !== email) {
      await db.update(profiles).set({ email }).where(eq(profiles.id, user.id));
    }
  });

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

  if (memberships.length === 0) {
    // Not an internal team member — the authoritative resolver decides:
    // active client-portal members go to /portal, suspended/revoked ones to
    // the access-denied page, everyone else to normal setup.
    const portalStatus = await bestPortalStatus(user.id);
    redirect(resolvePostLoginDestination({ hasInternalMembership: false, portalMembershipStatus: portalStatus }));
  }

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

/* ========== client portal guards ========== */

/** The user's most-favorable portal membership status: active beats
 * suspended beats revoked; null when they have no portal membership. */
async function bestPortalStatus(profileId: string): Promise<ClientPortalStatus | null> {
  const rows = await guardInfra(() =>
    db
      .select({ status: clientPortalMemberships.status })
      .from(clientPortalMemberships)
      .where(eq(clientPortalMemberships.profileId, profileId))
  );
  if (rows.length === 0) return null;
  const order: ClientPortalStatus[] = ["active", "suspended", "revoked", "invited"];
  for (const s of order) if (rows.some((r) => r.status === s)) return s;
  return rows[0].status;
}

export type ClientPortalContext = {
  user: AppUser;
  membership: {
    id: string;
    role: ClientPortalRole;
    status: ClientPortalStatus;
    clientId: string;
    workspaceId: string;
  };
  client: typeof clients.$inferSelect;
  workspace: typeof workspaces.$inferSelect;
};

/**
 * Gate for every /portal page and portal query. Revalidates the profile,
 * the ACTIVE membership, and the workspace/client pair server-side on each
 * request — client/workspace ids are never taken from the browser.
 * Internal team members are sent back to the internal dashboard.
 */
export const requireClientPortalUser = cache(async (): Promise<ClientPortalContext> => {
  const user = await requireUser();

  const [internal] = await guardInfra(() =>
    db.select({ id: workspaceMembers.id }).from(workspaceMembers).where(eq(workspaceMembers.userId, user.id)).limit(1)
  );
  if (internal) redirect("/dashboard");

  const rows = await guardInfra(() =>
    db
      .select({ membership: clientPortalMemberships, client: clients, workspace: workspaces })
      .from(clientPortalMemberships)
      .innerJoin(clients, eq(clientPortalMemberships.clientId, clients.id))
      .innerJoin(workspaces, eq(clientPortalMemberships.workspaceId, workspaces.id))
      .where(eq(clientPortalMemberships.profileId, user.id))
  );

  const active = rows.find((r) => r.membership.status === "active");
  if (!active) {
    const status = rows.length > 0 ? "suspended" : null;
    redirect(resolvePostLoginDestination({ hasInternalMembership: false, portalMembershipStatus: status }));
  }

  return {
    user,
    membership: {
      id: active.membership.id,
      role: active.membership.role,
      status: active.membership.status,
      clientId: active.membership.clientId,
      workspaceId: active.membership.workspaceId,
    },
    client: active.client,
    workspace: active.workspace,
  };
});
