import "server-only";
import { requireClientPortalUser, type ClientPortalContext } from "@/lib/auth/session";
import { assertPortalRole } from "@/lib/portal";
import type { ClientPortalRole } from "@/lib/portal";

export { actionError, type ActionResult } from "./action-error";

/**
 * Portal-side equivalent of authorize(): validates the session, resolves
 * the caller's ACTIVE client-portal membership server-side (never trusting
 * a browser-supplied clientId/workspaceId — requireClientPortalUser()
 * re-derives both from the DB on every call), and enforces a minimum
 * portal role. Every portal lead query/action must go through this.
 */
export async function authorizePortal(minRole: ClientPortalRole = "client_read_only"): Promise<ClientPortalContext> {
  const ctx = await requireClientPortalUser();
  assertPortalRole(ctx.membership.role, minRole);
  return ctx;
}
