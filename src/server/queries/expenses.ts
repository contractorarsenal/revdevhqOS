import "server-only";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";

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
 * dated in that month, plus monthly expenses that started on/before it. */
export async function getExpensesForMonth(workspaceId: string, monthStart: string) {
  const next = new Date(monthStart + "T00:00:00Z");
  next.setUTCMonth(next.getUTCMonth() + 1);
  const monthEnd = next.toISOString().slice(0, 10);

  const rows = await db
    .select({ amount: expenses.amount, frequency: expenses.frequency, expenseDate: expenses.expenseDate })
    .from(expenses)
    .where(and(
      eq(expenses.workspaceId, workspaceId),
      eq(expenses.status, "active"),
      sql`(${expenses.frequency} = 'monthly' and ${expenses.expenseDate} < ${monthEnd}) or (${expenses.frequency} != 'monthly' and ${expenses.expenseDate} >= ${monthStart} and ${expenses.expenseDate} < ${monthEnd})`
    ));
  return rows.reduce((sum, r) => sum + Number(r.amount), 0);
}
