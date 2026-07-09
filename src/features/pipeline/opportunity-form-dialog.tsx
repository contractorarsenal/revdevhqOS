"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { opportunitySchema } from "@/lib/validation";
import { createOpportunity, updateOpportunity } from "@/server/actions/pipeline";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = z.input<typeof opportunitySchema>;

export function OpportunityFormDialog({
  open, onOpenChange, stages, members, leads, opportunity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: { id: string; name: string; isWon: boolean; isLost: boolean }[];
  members: { userId: string; name: string }[];
  leads: { id: string; company: string }[];
  opportunity?: (Partial<FormValues> & { id: string }) | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = Boolean(opportunity?.id);
  const openStages = stages.filter((s) => !s.isWon && !s.isLost);

  const form = useForm<FormValues>({ resolver: zodResolver(opportunitySchema) });

  useEffect(() => {
    if (open) {
      form.reset({
        name: opportunity?.name ?? "",
        stageId: opportunity?.stageId ?? openStages[0]?.id ?? "",
        contactName: opportunity?.contactName ?? "",
        value: opportunity?.value ?? "",
        mrr: opportunity?.mrr ?? "",
        ownerId: opportunity?.ownerId ?? "",
        expectedCloseDate: opportunity?.expectedCloseDate ?? "",
        leadId: opportunity?.leadId ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, opportunity]);

  function onSubmit(values: FormValues) {
    setServerError(null);
    const payload = { ...values, leadId: values.leadId || null };
    startTransition(async () => {
      const result = isEdit ? await updateOpportunity(opportunity!.id, payload) : await createOpportunity(payload);
      if (!result.ok) return setServerError(result.error);
      toast.success(isEdit ? "Opportunity updated" : "Opportunity created");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit opportunity" : "Add opportunity"}</DialogTitle>
          <DialogDescription>A revenue deal tracked through your pipeline stages.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Deal / company name *</Label>
            <Input {...form.register("name")} placeholder="Oak & Iron Custom Homes" />
            {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Stage</Label>
            <select {...form.register("stageId")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
              {openStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label>Contact</Label><Input {...form.register("contactName")} /></div>
          <div className="space-y-1">
            <Label>Deal value (USD) *</Label>
            <Input type="number" step="0.01" min="0" {...form.register("value")} placeholder="12000" />
            {form.formState.errors.value && <p className="text-xs text-destructive">{String(form.formState.errors.value.message)}</p>}
          </div>
          <div className="space-y-1">
            <Label>Potential MRR (USD)</Label>
            <Input type="number" step="0.01" min="0" {...form.register("mrr")} placeholder="2500" />
          </div>
          <div className="space-y-1">
            <Label>Owner</Label>
            <select {...form.register("ownerId")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label>Expected close</Label><Input type="date" {...form.register("expectedCloseDate")} /></div>
          {!isEdit && (
            <div className="col-span-2 space-y-1">
              <Label>Source lead (optional)</Label>
              <select {...form.register("leadId")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                <option value="">None</option>
                {leads.map((l) => <option key={l.id} value={l.id}>{l.company}</option>)}
              </select>
            </div>
          )}
          {serverError && <p className="col-span-2 text-sm text-destructive">{serverError}</p>}
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save deal" : "Create deal"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
