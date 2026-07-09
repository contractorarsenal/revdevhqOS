export type WorkspaceRole = "owner" | "admin" | "manager" | "member" | "viewer";

const ROLE_LEVEL: Record<WorkspaceRole, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  member: 2,
  viewer: 1,
};

/** True when `role` is at least as privileged as `required`. */
export function hasRole(role: WorkspaceRole, required: WorkspaceRole): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[required];
}

/** Viewer can read; everything above can write core records. */
export function canWrite(role: WorkspaceRole): boolean {
  return hasRole(role, "member");
}

/** Billing mutations (invoices, payments, subscriptions). */
export function canManageBilling(role: WorkspaceRole): boolean {
  return hasRole(role, "manager");
}

/** Workspace settings, members, pipeline structure. */
export function canAdminister(role: WorkspaceRole): boolean {
  return hasRole(role, "admin");
}

export function assertRole(role: WorkspaceRole, required: WorkspaceRole): void {
  if (!hasRole(role, required)) {
    throw new Error("You do not have permission to perform this action.");
  }
}
