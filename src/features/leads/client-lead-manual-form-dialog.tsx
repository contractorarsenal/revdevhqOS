"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { clientLeadManualEntrySchema } from "@/lib/validation";
import { createManualClientLead } from "@/server/actions/leads";
import { CLIENT_LEAD_STATUSES, CLIENT_LEAD_STATUS_LABEL, LEAD_SOURCES } from "@/lib/leads-client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = z.input<typeof clientLeadManualEntrySchema>;

/** Internal owner/admin manual entry of a lead FOR a client — appears in
 * that client's portal immediately via createManualClientLead(), the same
 * canonical ingestion path future website/webhook integrations will use. */
export function ClientLeadManualFormDialog({
  open, onOpenChange, clients, fixedClientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: { id: string; name: string }[];
  fixedClientId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<FormValues>({ resolver: zodResolver(clientLeadManualEntrySchema) });
  // Server-side failures live on RHF's "root" error, so opening the dialog
  // (form.reset below) clears them for free — no setState inside the effect.
  const serverError = form.formState.errors.root?.message;

  useEffect(() => {
    if (open) {
      form.reset({
        clientId: fixedClientId ?? "",
        name: "", email: "", phone: "", requestedService: "",
        source: "Manual", receivedAt: new Date().toISOString().slice(0, 10),
        status: "new", estimatedValue: "",
      });
    }
  }, [open, fixedClientId, form]);

  function onSubmit(values: FormValues) {
    form.clearErrors("root");
    startTransition(async () => {
      const result = await createManualClientLead(values);
      if (!result.ok) return form.setError("root", { message: result.error });
      toast.success("Lead created — it's now visible in the client's portal");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add client lead</DialogTitle>
          <DialogDescription>Manually record a lead for a client — it appears in their portal immediately.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-2 gap-3">
          {!fixedClientId && (
            <div className="col-span-2 space-y-1">
              <Label>Client *</Label>
              <select {...form.register("clientId")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                <option value="">Select a client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {form.formState.errors.clientId && <p className="text-xs text-destructive">{form.formState.errors.clientId.message}</p>}
            </div>
          )}
          <div className="col-span-2 space-y-1">
            <Label>Name *</Label>
            <Input {...form.register("name")} placeholder="Jane Homeowner" />
            {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-1"><Label>Email</Label><Input {...form.register("email")} /></div>
          <div className="space-y-1"><Label>Phone</Label><Input {...form.register("phone")} /></div>
          <div className="col-span-2 space-y-1"><Label>Requested service</Label><Input {...form.register("requestedService")} placeholder="Roof estimate" /></div>
          <div className="space-y-1">
            <Label>Source</Label>
            <select {...form.register("source")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
              {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Date received *</Label>
            <Input type="date" {...form.register("receivedAt")} />
            {form.formState.errors.receivedAt && <p className="text-xs text-destructive">{form.formState.errors.receivedAt.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <select {...form.register("status")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
              {CLIENT_LEAD_STATUSES.map((s) => <option key={s} value={s}>{CLIENT_LEAD_STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Estimated value (USD)</Label>
            <Input type="number" step="0.01" min="0" {...form.register("estimatedValue")} placeholder="Optional" />
          </div>
          {serverError && <p className="col-span-2 text-sm text-destructive">{serverError}</p>}
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Create lead"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
