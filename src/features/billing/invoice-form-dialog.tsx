"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import { invoiceSchema } from "@/lib/validation";
import { createInvoice } from "@/server/actions/billing";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/finance/metrics";

type FormValues = z.input<typeof invoiceSchema>;

export function InvoiceFormDialog({
  open, onOpenChange, clients, suggestedNumber, fixedClientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: { id: string; name: string }[];
  suggestedNumber: string;
  fixedClientId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({ resolver: zodResolver(invoiceSchema) });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const items = form.watch("items") ?? [];
  const total = items.reduce((sum, i) => sum + (Number(i?.quantity) || 0) * (Number(i?.unitPrice) || 0), 0);

  useEffect(() => {
    if (open) {
      setServerError(null);
      form.reset({
        clientId: fixedClientId ?? clients[0]?.id ?? "",
        number: suggestedNumber,
        status: "open",
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
        items: [{ description: "", quantity: 1, unitPrice: "" }],
      });
    }
  }, [open, fixedClientId, clients, suggestedNumber, form]);

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await createInvoice(values);
      if (!result.ok) return setServerError(result.error);
      toast.success("Invoice created");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create invoice</DialogTitle>
          <DialogDescription>Amounts requested from a client. Recording payments reduces the balance.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {!fixedClientId && (
              <div className="space-y-1">
                <Label>Client *</Label>
                <select {...form.register("clientId")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Invoice number *</Label>
              <Input {...form.register("number")} />
              {form.formState.errors.number && <p className="text-xs text-destructive">{form.formState.errors.number.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <select {...form.register("status")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                <option value="open">Open (issued)</option>
                <option value="draft">Draft</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Issue date</Label>
              <Input type="date" {...form.register("issueDate")} />
            </div>
            <div className="space-y-1">
              <Label>Due date</Label>
              <Input type="date" {...form.register("dueDate")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Line items *</Label>
            {fields.map((field, i) => (
              <div key={field.id} className="flex items-start gap-2">
                <Input className="flex-1" placeholder="Description" {...form.register(`items.${i}.description`)} />
                <Input className="w-16" type="number" step="0.01" min="0.01" placeholder="Qty" {...form.register(`items.${i}.quantity`)} />
                <Input className="w-28" type="number" step="0.01" min="0" placeholder="Unit price" {...form.register(`items.${i}.unitPrice`)} />
                <Button type="button" variant="ghost" size="icon" className="size-9 text-muted-foreground" onClick={() => remove(i)} disabled={fields.length === 1}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            {form.formState.errors.items && <p className="text-xs text-destructive">Check line items — description and price are required.</p>}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => append({ description: "", quantity: 1, unitPrice: "" })}>
                <Plus className="size-3.5" /> Add line
              </Button>
              <p className="text-sm">
                Total: <span className="tabular-nums font-semibold">{formatMoney(total)}</span>
              </p>
            </div>
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Create invoice"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
