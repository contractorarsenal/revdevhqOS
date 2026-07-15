import { revalidatePath } from "next/cache";

/**
 * Call after any mutation that can move an automatic goal metric: payments
 * (revenue_collected), clients (new_clients), leads (new_leads), projects
 * (projects_completed), or tasks (tasks_completed). The mutation doesn't
 * know which goals' periods overlap the changed record, so this revalidates
 * every goal page rather than a single id — "/goals/[id]" with type "page"
 * invalidates all dynamic instances of the goal detail route at once.
 */
export function revalidateGoalPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/goals");
  revalidatePath("/goals/[id]", "page");
}
