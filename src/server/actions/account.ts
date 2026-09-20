"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { actionError, type ActionResult } from "@/server/action-error";
import { changePasswordSchema } from "@/lib/validation";

/** Changes the signed-in user's own password via Supabase Auth's own
 * session-bound update — the app database never stores or sees the value. */
export async function changePassword(input: unknown): Promise<ActionResult> {
  try {
    await requireUser();
    const { password } = changePasswordSchema.parse(input);
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
