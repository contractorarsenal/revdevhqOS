"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { paymentSchema } from "@/lib/validation";
import { recordPayment, updatePayment } from "@/server/actions/billing";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invoiceBalance } from "@/lib/finance/metrics";

type FormValues = z.input<typeof paymentSchema>;

export type InvoiceOption = {
  id: string; number: string; clientId: string; clientName: string;
  total: string; amountPaid: string; status: string;
};

export type EditablePayment = {
  id: string; clientId: string | null; invoiceId: string | null; amount: string;
  status: string; paymentType: string; billingMonth: string | null;
  method: string | null; reference: string | null; paidAt: string | Date;
};

export function PaymentFormDialog({
  open, onOpenChange, clients, invoices, fixedClientId, payment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: { id: string; name: string }[];
  invoices: InvoiceOption[];
  fixedClientId?: string;
  payment?: EditablePayment | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = Boolean(payment?.id);

  const form = useForm<FormValues>({ resolver: zodResolver(paymentSchema) });
  const selectedClientId = form.watch("clientId") || fixedClientId || "";
  const openInvoices = invoices.filter(
    (i) => ["open", "past_due"].includes(i.status) && (!selectedClientId || i.clientId === selectedClientId)
  );

  useEffect(() => {
    if (open) {
      setServerError(null);
      form.reset(
        payment
          ? {
              clientId: payment.clientId ?? "",
              invoiceId: payment.invoiceId ?? "",
              amount: payment.amount,
              status: payment.status as FormValues["status"],
              paymentType: payment.paymentType as FormValues["paymentType"],
              billingMonth: payment.billingMonth ? payment.billingMonth.slice(0, 7) : new Date().toISOString().slice(0, 7),
              method: payment.method ?? "",
              reference: payment.reference ?? "",
              paidAt: new Date(payment.paidAt).toISOString().slice(0, 10),
            }
          : {
              clientId: fixedClientId ?? "",
              invoiceId: "",
              amount: "",
              status: "succeeded",
              paymentType: "one_time",
              billingMonth: new Date().toISOString().slice(0, 7),
              method: "",
              reference: "",
              paidAt: new Date().toISOString().slice(0, 10),
            }
      );
    }
  }, [open, fixedClientId, payment, form]);

  function onInvoiceChange(invoiceId: string) {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (inv) form.setValue("amount", String(invoiceBalance(inv)));
  }

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = isEdit
        ? await updatePayment(payment!.id, values)
        : await recordPayment({
            ...values,
            clientId: values.clientId || null,
            invoiceId: values.invoiceId || null,
          });
      if (!result.ok) return setServerError(result.error);
      toast.success(isEdit ? "Payment updated" : "Payment recorded");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit payment" : "Record payment"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Changes to amount or status immediately re-apply to the linked invoice and any revenue goal."
              : "Money actually collected. Linking an invoice updates its balance and can mark it paid."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          {!fixedClientId && (
            <div className="space-y-1">
              <Label>Client</Label>
              <select disabled={isEdit} {...form.register("clientId")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm disabled:opacity-60">
                <option value="">No client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Apply to invoice</Label>
            <select
              disabled={isEdit}
              {...form.register("invoiceId", { onChange: (e) => onInvoiceChange(e.target.value) })}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm disabled:opacity-60"
            >
              <option value="">No invoice</option>
              {openInvoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.number} — {i.clientName} (balance ${invoiceBalance(i).toLocaleString()})
                </option>
              ))}
            </select>
            {isEdit && <p className="text-[11px] text-muted-foreground">Client and invoice can&apos;t be changed after the payment is recorded.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Amount (USD) *</Label>
              <Input type="number" step="0.01" min="0.01" {...form.register("amount")} />
              {form.formState.errors.amount && <p className="text-xs text-destructive">{String(form.formState.errors.amount.message)}</p>}
            </div>
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" {...form.register("paidAt")} />
            </div>
            <div className="space-y-1">
              <Label>Payment type</Label>
              <select {...form.register("paymentType")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                <option value="one_time">One-time</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Billing month</Label>
              <Input type="month" {...form.register("billingMonth")} />
            </div>
            <div className="space-y-1">
              <Label>Method</Label>
              <select {...form.register("method")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                <option value="">—</option>
                {["ACH", "Card", "Check", "Wire", "Cash", "Other"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <select {...form.register("status")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                {["succeeded", "pending", "failed", "refunded"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Reference</Label>
            <Input {...form.register("reference")} placeholder="Check #, transaction id…" />
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save changes" : "Record payment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
