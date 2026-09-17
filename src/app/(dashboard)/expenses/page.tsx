import { requireWorkspace } from "@/lib/auth/session";
import { listExpenses } from "@/server/queries/expenses";
import { ExpensesView } from "@/features/expenses/expenses-view";
import { todayInTimezone } from "@/lib/date-tz";

export default async function ExpensesPage() {
  const ctx = await requireWorkspace();
  const expenses = await listExpenses(ctx.workspace.id, true);
  const thisMonth = todayInTimezone(ctx.workspace.timezone).slice(0, 7);
  return <ExpensesView expenses={expenses} thisMonth={thisMonth} />;
}
