"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { subscriptionSchema } from "@/lib/validation";
import { updateSubscription } from "@/server/actions/billing";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = z.input<typeof subscriptionSchema>;

export function SubscriptionEditDialog({
  open, onOpenChange, subscription,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: {
    id: string; clientId: string; serviceId: string; amount: string; frequency: string;
    status: string; startDate: string; nextBillingDate: string | null; paymentDay: number | null;
  } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(subscriptionSchema) });

  useEffect(() => {
    if (open && subscription) {
      form.reset({
        clientId: subscription.clientId,
        serviceId: subscription.serviceId,
        amount: subscription.amount,
        frequency: subscription.frequency as FormValues["frequency"],
        status: subscription.status as FormValues["status"],
        startDate: subscription.startDate,
        nextBillingDate: subscription.nextBillingDate ?? "",
        paymentDay: subscription.paymentDay ?? "",
      });
    }
  }, [open, subscription, form]);

  function onSubmit(values: FormValues) {
    setServerError(null);
    if (!subscription) return;
    setServerError(null);
    startTransition(async () => {
      const result = await updateSubscription(subscription.id, values);
      if (!result.ok) return setServerError(result.error);
      toast.success("Subscription updated");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit subscription</DialogTitle>
          <DialogDescription>Amount, billing day, and status for this recurring service.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Amount (USD) *</Label>
              <Input type="number" step="0.01" min="0" {...form.register("amount")} />
            </div>
            <div className="space-y-1">
              <Label>Frequency</Label>
              <select {...form.register("frequency")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                {["one_time", "weekly", "monthly", "quarterly", "yearly"].map((f) => <option key={f} value={f}>{f.replace("_", "-")}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Payment day of month</Label>
              <Input type="number" min="1" max="28" {...form.register("paymentDay")} placeholder="e.g. 5" />
              <p className="text-[11px] text-muted-foreground">Used to know when a monthly payment is due.</p>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <select {...form.register("status")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                {["trial", "active", "past_due", "paused", "canceled", "completed"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Start date</Label>
              <Input type="date" {...form.register("startDate")} />
            </div>
            <div className="space-y-1">
              <Label>Next billing date</Label>
              <Input type="date" {...form.register("nextBillingDate")} />
            </div>
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
