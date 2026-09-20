"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles, workspaceMembers } from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/server/activity";
import { env } from "@/lib/env/server";
import { inviteMemberSchema, updateMemberRoleSchema } from "@/lib/validation";

async function ownerCount(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<string>`count(*)` })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "owner")));
  return Number(row?.n ?? 0);
}

/**
 * Adds a teammate to the workspace via Supabase Auth's own invite flow —
 * we never generate or see a password. If the email already belongs to an
 * existing Supabase Auth user (e.g. invited elsewhere before), that
 * identity is reused instead of failing the whole action.
 */
export async function inviteMember(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("owner");
    const { email, name, role } = inviteMemberSchema.parse(input);

    const [existingMember] = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .innerJoin(profiles, eq(workspaceMembers.userId, profiles.id))
      .where(and(eq(workspaceMembers.workspaceId, ctx.workspace.id), eq(profiles.email, email)))
      .limit(1);
    if (existingMember) throw new Error("This person is already a member of this workspace.");

    const admin = createAdminClient();
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name },
      redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/confirm?next=/settings`,
    });

    let userId = invited?.user?.id ?? null;
    if (!userId) {
      // Most likely cause: an auth user with this email already exists.
      // Reuse that identity instead of failing the whole action.
      for (let page = 1; page <= 10 && !userId; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw new Error(inviteErr?.message ?? error.message);
        userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
        if (data.users.length < 200) break;
      }
      if (!userId) throw new Error(inviteErr?.message ?? "Could not invite this person.");
    }

    await db
      .insert(profiles)
      .values({ id: userId, name, email })
      .onConflictDoUpdate({ target: profiles.id, set: { email } });
    await db.insert(workspaceMembers).values({ workspaceId: ctx.workspace.id, userId, role });

    await logActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      action: "member.invited",
      entityType: "workspace_member",
      entityId: userId,
      metadata: { email, role },
    });

    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateMemberRole(memberId: string, input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("owner");
    const { role } = updateMemberRoleSchema.parse(input);

    const [member] = await db
      .select({ id: workspaceMembers.id, userId: workspaceMembers.userId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.id, memberId), eq(workspaceMembers.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (!member) throw new Error("Member not found.");

    if (member.role === "owner" && role !== "owner" && (await ownerCount(ctx.workspace.id)) <= 1) {
      throw new Error("A workspace must have at least one owner.");
    }

    await db.update(workspaceMembers).set({ role }).where(eq(workspaceMembers.id, memberId));
    await logActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      action: "member.role_changed",
      entityType: "workspace_member",
      entityId: member.userId,
      metadata: { role, previousRole: member.role },
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

/** Removes a teammate's access to this workspace only — never deletes their
 * Supabase Auth identity or profile, so re-adding them later is trivial. */
export async function removeMember(memberId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("owner");

    const [member] = await db
      .select({ id: workspaceMembers.id, userId: workspaceMembers.userId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.id, memberId), eq(workspaceMembers.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (!member) throw new Error("Member not found.");
    if (member.userId === ctx.user.id) throw new Error("You cannot remove your own access.");
    if (member.role === "owner" && (await ownerCount(ctx.workspace.id)) <= 1) {
      throw new Error("A workspace must have at least one owner.");
    }

    await db.delete(workspaceMembers).where(eq(workspaceMembers.id, memberId));
    await logActivity({
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      action: "member.removed",
      entityType: "workspace_member",
      entityId: member.userId,
      metadata: { previousRole: member.role },
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
