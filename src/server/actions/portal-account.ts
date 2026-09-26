"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { authorizePortal, actionError, type ActionResult } from "@/server/portal-authorize";
import { portalAccountSchema } from "@/lib/validation";

/** A portal user may change ONLY their own display name. Role, client_id,
 * workspace_id, status, and email are never accepted here — the input schema
 * has no such fields and the update is keyed to the session user's own id. */
export async function updatePortalAccount(input: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorizePortal("client_read_only");
    const { name } = portalAccountSchema.parse(input);
    await db.update(profiles).set({ name }).where(eq(profiles.id, ctx.user.id));
    revalidatePath("/clientportal/account");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
