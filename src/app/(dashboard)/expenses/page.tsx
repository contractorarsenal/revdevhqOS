import { requireWorkspace } from "@/lib/auth/session";
import { listExpenses } from "@/server/queries/expenses";
import { ExpensesView } from "@/features/expenses/expenses-view";

export default async function ExpensesPage() {
  const ctx = await requireWorkspace();
  const expenses = await listExpenses(ctx.workspace.id, true);
  return <ExpensesView expenses={expenses} />;
}
