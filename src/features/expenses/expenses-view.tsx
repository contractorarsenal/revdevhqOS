"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Receipt, Archive } from "lucide-react";
import { archiveExpense } from "@/server/actions/billing";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard, MetricGrid } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { FinancialAmount } from "@/components/shared/financial-amount";
import { DataTable, sortableHeader } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/finance/metrics";
import { ExpenseFormDialog } from "./expense-form-dialog";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ExpensesView({ expenses }: { expenses: any[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [month, setMonth] = useState("all");
  const [category, setCategory] = useState("all");

  const active = expenses.filter((e) => e.status === "active");
  const months = useMemo(
    () => [...new Set(active.map((e) => e.expenseDate.slice(0, 7)))].sort().reverse(),
    [active]
  );
  const filtered = active.filter(
    (e) => (month === "all" || e.expenseDate.slice(0, 7) === month) && (category === "all" || e.category === category)
  );
  const total = filtered.reduce((sum, e) => sum + Number(e.amount), 0);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const thisMonthTotal = active
    .filter((e) => e.frequency === "monthly" ? e.expenseDate.slice(0, 7) <= thisMonth : e.expenseDate.slice(0, 7) === thisMonth)
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const columns: ColumnDef<any>[] = [
    { accessorKey: "name", header: sortableHeader("Expense"), cell: ({ row }) => <span className="font-semibold">{row.original.name}</span> },
    { accessorKey: "category", header: "Category", cell: ({ row }) => <span className="capitalize">{row.original.category.replace("_", " ")}</span> },
    { accessorKey: "amount", header: sortableHeader("Amount"), cell: ({ row }) => <FinancialAmount value={row.original.amount} /> },
    { accessorKey: "frequency", header: "Type", cell: ({ row }) => <StatusBadge status={row.original.frequency === "monthly" ? "monthly" : "one-time"} tone={row.original.frequency === "monthly" ? "indigo" : "neutral"} /> },
    { accessorKey: "expenseDate", header: sortableHeader("Date") },
    { accessorKey: "vendor", header: "Vendor", cell: ({ row }) => row.original.vendor ?? <span className="text-muted-foreground">—</span> },
    {
      id: "actions", header: "",
      cell: ({ row }) => (
        <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setEditing(row.original); setFormOpen(true); }}>Edit</Button>
          <ConfirmationDialog
            trigger={<Button variant="ghost" size="icon" className="size-7 text-muted-foreground" title="Archive"><Archive className="size-3.5" /></Button>}
            title="Archive this expense?"
            description="It will be removed from totals and reports, but the record is kept."
            confirmLabel="Archive"
            destructive
            onConfirm={async () => {
              const result = await archiveExpense(row.original.id);
              if (!result.ok) toast.error(result.error);
              else { toast.success("Expense archived"); router.refresh(); }
            }}
          />
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Expenses" description="Track agency costs to see real profit.">
        <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="size-3.5" /> Add Expense
        </Button>
      </PageHeader>
      <MetricGrid>
        <MetricCard label="This month" value={formatMoney(thisMonthTotal)} hint="active expenses" />
        <MetricCard label="Filtered total" value={formatMoney(total)} hint={`${filtered.length} expenses`} />
      </MetricGrid>
      {active.length === 0 ? (
        <EmptyState icon={Receipt} title="No expenses yet" description="Track software, payroll, ads, and other agency costs."
          action={<Button size="sm" onClick={() => setFormOpen(true)}><Plus className="size-3.5" /> Add Expense</Button>} />
      ) : (
        <DataTable columns={columns} data={filtered} searchPlaceholder="Search expenses…"
          toolbar={
            <span className="ml-auto flex gap-2">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-xs">
                <option value="all">All categories</option>
                {["software", "office_rent", "payroll", "contractors", "ads", "tools", "misc"].map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
              </select>
              <select value={month} onChange={(e) => setMonth(e.target.value)} className="h-8 rounded-md border border-input bg-transparent px-2 text-xs">
                <option value="all">All months</option>
                {months.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </span>
          } />
      )}
      <ExpenseFormDialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }} expense={editing} />
    </div>
  );
}
