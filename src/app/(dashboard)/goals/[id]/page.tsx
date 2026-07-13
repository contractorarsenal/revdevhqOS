import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getGoal } from "@/server/queries/goals";
import { todayInTimezone } from "@/lib/date-tz";
import { canAdminister } from "@/lib/permissions";
import { GoalDetailView } from "@/features/goals/goal-detail-view";

export default async function GoalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const ctx = await requireWorkspace();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const goal = await getGoal(ctx.workspace.id, id, ctx.workspace.timezone);
  if (!goal) notFound();
  const { progressUpdates, ...rest } = goal;
  return (
    <GoalDetailView
      goal={rest}
      progressUpdates={progressUpdates}
      today={todayInTimezone(ctx.workspace.timezone)}
      canManage={canAdminister(ctx.role)}
      openEdit={sp.edit === "1"}
    />
  );
}
