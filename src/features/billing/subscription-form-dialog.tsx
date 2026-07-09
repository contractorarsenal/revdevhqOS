"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { subscriptionSchema } from "@/lib/validation";
import { createSubscription } from "@/server/actions/billing";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = z.input<typeof subscriptionSchema>;

export type ClientOption = { id: string; name: string };
export type ServiceOption = { id: string; name: string; defaultPrice: string | null; defaultFrequency: string };

export function SubscriptionFormDialog({
  open, onOpenChange, clients, services, fixedClientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ClientOption[];
  services: ServiceOption[];
  fixedClientId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({ resolver: zodResolver(subscriptionSchema) });

  useEffect(() => {
    if (open) {
      form.reset({
        clientId: fixedClientId ?? clients[0]?.id ?? "",
        serviceId: services[0]?.id ?? "",
        amount: services[0]?.defaultPrice ?? "",
        frequency: (services[0]?.defaultFrequency as FormValues["frequency"]) ?? "monthly",
        status: "active",
        startDate: new Date().toISOString().slice(0, 10),
        nextBillingDate: "",
      });
    }
  }, [open, fixedClientId, clients, services, form]);

  function onServiceChange(serviceId: string) {
    const svc = services.find((s) => s.id === serviceId);
    if (svc?.defaultPrice) form.setValue("amount", svc.defaultPrice);
    if (svc?.defaultFrequency) form.setValue("frequency", svc.defaultFrequency as FormValues["frequency"]);
  }

  function onSubmit(values: FormValues) {
    setServerError(null);
    startTransition(async () => {
      const result = await createSubscription(values);
      if (!result.ok) return setServerError(result.error);
      toast.success("Subscription created");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New subscription</DialogTitle>
          <DialogDescription>Recurring (or one-time) billing expectation for a client. Counts toward MRR.</DialogDescription>
        </DialogHeader>
        {services.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Create a service first (Billing → Services) — subscriptions are always linked to a service.
          </p>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            {!fixedClientId && (
              <div className="space-y-1">
                <Label>Client *</Label>
                <select {...form.register("clientId")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Service *</Label>
              <select
                {...form.register("serviceId", { onChange: (e) => onServiceChange(e.target.value) })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
              >
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount (USD) *</Label>
                <Input type="number" step="0.01" min="0" {...form.register("amount")} />
                {form.formState.errors.amount && <p className="text-xs text-destructive">{String(form.formState.errors.amount.message)}</p>}
              </div>
              <div className="space-y-1">
                <Label>Frequency</Label>
                <select {...form.register("frequency")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                  {["one_time", "weekly", "monthly", "quarterly", "yearly"].map((f) => (
                    <option key={f} value={f}>{f.replace("_", "-")}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Start date *</Label>
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
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Create subscription"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
