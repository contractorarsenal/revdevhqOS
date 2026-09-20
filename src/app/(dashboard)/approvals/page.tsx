import { requireWorkspace } from "@/lib/auth/session";
import { listApprovals } from "@/server/queries/approvals";
import { ApprovalsView } from "@/features/approvals/approvals-view";

export default async function ApprovalsPage() {
  const ctx = await requireWorkspace();
  const items = await listApprovals(ctx.workspace.id);
  return <ApprovalsView items={items} role={ctx.role} />;
}
