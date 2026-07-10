import "server-only";
import { requireWorkspace, type WorkspaceContext } from "@/lib/auth/session";
import { assertRole, type WorkspaceRole } from "@/lib/permissions";

export { actionError, type ActionResult } from "./action-error";

/**
 * Standard entry point for every server action / query:
 * validates session, workspace membership, and minimum role.
 */
export async function authorize(minRole: WorkspaceRole = "viewer"): Promise<WorkspaceContext> {
  const ctx = await requireWorkspace();
  assertRole(ctx.role, minRole);
  return ctx;
}
