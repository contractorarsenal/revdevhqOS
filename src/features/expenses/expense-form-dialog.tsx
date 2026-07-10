"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { expenseSchema } from "@/lib/validation";
import { createExpense, updateExpense } from "@/server/actions/billing";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = z.input<typeof expenseSchema>;
const CATEGORIES = ["software", "office_rent", "payroll", "contractors", "ads", "tools", "misc"] as const;

export function ExpenseFormDialog({
  open, onOpenChange, expense,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: { id: string; name: string; category: string; amount: string; expenseDate: string; frequency: string; vendor: string | null; notes: string | null } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = Boolean(expense?.id);
  const form = useForm<FormValues>({ resolver: zodResolver(expenseSchema) });

  useEffect(() => {
    if (open) {
      form.reset({
        name: expense?.name ?? "",
        category: (expense?.category as FormValues["category"]) ?? "misc",
        amount: expense?.amount ?? "",
        expenseDate: expense?.expenseDate ?? new Date().toISOString().slice(0, 10),
        frequency: (expense?.frequency as FormValues["frequency"]) ?? "one_time",
        vendor: expense?.vendor ?? "",
        notes: expense?.notes ?? "",
      });
    }
  }, [open, expense, form]);

  function onSubmit(values: FormValues) {
    setServerError(null);
    startTransition(async () => {
      const result = isEdit ? await updateExpense(expense!.id, values) : await createExpense(values);
      if (!result.ok) return setServerError(result.error);
      toast.success(isEdit ? "Expense updated" : "Expense added");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Edit expense" : "Add expense"}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input {...form.register("name")} placeholder="Adobe Creative Cloud" />
            {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <select {...form.register("category")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Frequency</Label>
              <select {...form.register("frequency")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                <option value="one_time">One-time</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Amount (USD) *</Label>
              <Input type="number" step="0.01" min="0" {...form.register("amount")} />
            </div>
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" {...form.register("expenseDate")} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Vendor</Label>
            <Input {...form.register("vendor")} placeholder="Optional" />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Input {...form.register("notes")} placeholder="Optional" />
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save changes" : "Add expense"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
