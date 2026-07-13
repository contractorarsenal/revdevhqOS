import { requireWorkspace } from "@/lib/auth/session";
import { listGoals } from "@/server/queries/goals";
import { todayInTimezone } from "@/lib/date-tz";
import { canAdminister } from "@/lib/permissions";
import { GoalsView } from "@/features/goals/goals-view";

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
