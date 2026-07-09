import "server-only";
import { requireWorkspace, type WorkspaceContext } from "@/lib/auth/session";
import { assertRole, type WorkspaceRole } from "@/lib/permissions";

/**
 * Standard entry point for every server action / query:
 * validates session, workspace membership, and minimum role.
 */
export async function authorize(minRole: WorkspaceRole = "viewer"): Promise<WorkspaceContext> {
  const ctx = await requireWorkspace();
  assertRole(ctx.role, minRole);
  return ctx;
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export function actionError(error: unknown): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : "Something went wrong. Try again.";
  return { ok: false, error: message };
}
