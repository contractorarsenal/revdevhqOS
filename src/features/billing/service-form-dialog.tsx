"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { serviceSchema } from "@/lib/validation";
import { createService, updateService } from "@/server/actions/billing";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = z.input<typeof serviceSchema>;
const FREQUENCIES = ["one_time", "weekly", "monthly", "quarterly", "yearly"] as const;

export function ServiceFormDialog({
  open, onOpenChange, service,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: { id: string; name: string; description: string | null; defaultPrice: string | null; defaultFrequency: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = Boolean(service?.id);

  const form = useForm<FormValues>({ resolver: zodResolver(serviceSchema) });

  useEffect(() => {
    if (open) {
      form.reset({
        name: service?.name ?? "",
        description: service?.description ?? "",
        defaultPrice: service?.defaultPrice ?? "",
        defaultFrequency: (service?.defaultFrequency as FormValues["defaultFrequency"]) ?? "monthly",
      });
    }
  }, [open, service, form]);

  function onSubmit(values: FormValues) {
    setServerError(null);
    startTransition(async () => {
      const result = isEdit ? await updateService(service!.id, values) : await createService(values);
      if (!result.ok) return setServerError(result.error);
      toast.success(isEdit ? "Service updated" : "Service created");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit service" : "Add service"}</DialogTitle>
          <DialogDescription>Services are what you sell — subscriptions reference them.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input {...form.register("name")} placeholder="Google Ads management" />
            {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input {...form.register("description")} placeholder="What is included" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Default price (USD)</Label>
              <Input type="number" step="0.01" min="0" {...form.register("defaultPrice")} placeholder="1400" />
            </div>
            <div className="space-y-1">
              <Label>Default frequency</Label>
              <select {...form.register("defaultFrequency")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                {FREQUENCIES.map((f) => <option key={f} value={f}>{f.replace("_", "-")}</option>)}
              </select>
            </div>
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save service"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
