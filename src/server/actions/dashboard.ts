"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userDashboardPrefs } from "@/lib/db/schema";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { dashboardLayoutSchema } from "@/lib/validation";
import { normalizeLayout } from "@/lib/dashboard-layout";

/** Persists the caller's own layout. Keyed by the session user + workspace,
 * so one person can never write another person's layout. */
export async function saveDashboardLayout(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorize("viewer");
    const layout = normalizeLayout(dashboardLayoutSchema.parse(input));
    await db
      .insert(userDashboardPrefs)
      .values({ profileId: ctx.user.id, workspaceId: ctx.workspace.id, layout })
      .onConflictDoUpdate({
        target: [userDashboardPrefs.profileId, userDashboardPrefs.workspaceId],
        set: { layout, updatedAt: new Date() },
      });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function resetDashboardLayout(): Promise<ActionResult> {
  try {
    const ctx = await authorize("viewer");
    await db
      .delete(userDashboardPrefs)
      .where(and(eq(userDashboardPrefs.profileId, ctx.user.id), eq(userDashboardPrefs.workspaceId, ctx.workspace.id)));
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
