import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { monthPeriod } from "@/lib/goals";
import { calculateExpenseBreakdownForPeriod } from "./period-stats";

export async function listExpenses(workspaceId: string, includeArchived = false) {
  return db
    .select()
    .from(expenses)
    .where(
      includeArchived
        ? eq(expenses.workspaceId, workspaceId)
        : and(eq(expenses.workspaceId, workspaceId), eq(expenses.status, "active"))
    )
    .orderBy(sql`${expenses.expenseDate} desc`);
}

/** Total of active expenses effective in the given month: one-time expenses
 * dated in that month, plus monthly expenses that started on/before it.
 * Thin wrapper over calculateExpenseBreakdownForPeriod — the single
 * "effective in period" implementation Monthly Reports also uses. */
export async function getExpensesForMonth(workspaceId: string, monthStart: string) {
  const [year, month] = monthStart.split("-").map(Number);
  const period = monthPeriod(year, month);
  const breakdown = await calculateExpenseBreakdownForPeriod(db, workspaceId, period);
  return breakdown.total;
}
