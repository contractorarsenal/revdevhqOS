import { requireWorkspace } from "@/lib/auth/session";
import { listGoals } from "@/server/queries/goals";
import { todayInTimezone } from "@/lib/date-tz";
import { canAdminister } from "@/lib/permissions";
import { GoalsView } from "@/features/goals/goals-view";

// Date-sensitive: days remaining, pace, and due states must be computed at
// request time in the workspace timezone — time moves even when no mutation
// fires a revalidation, so this page must never be statically frozen.
export const dynamic = "force-dynamic";

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const ctx = await requireWorkspace();
  const [{ active, history }, params] = await Promise.all([
    listGoals(ctx.workspace.id, ctx.workspace.timezone),
    searchParams,
  ]);
  return (
    <GoalsView
      active={active}
      history={history}
      today={todayInTimezone(ctx.workspace.timezone)}
      canManage={canAdminister(ctx.role)}
      openNew={params.new === "1"}
    />
  );
}
