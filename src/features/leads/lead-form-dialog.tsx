"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { leadSchema } from "@/lib/validation";
import { createLead, updateLead } from "@/server/actions/leads";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FormValues = z.input<typeof leadSchema>;

const SOURCES = ["Referral", "Google Ads", "Website form", "Facebook", "Cold outreach", "Networking event", "Directory", "Other"];

export function LeadFormDialog({
  open, onOpenChange, members, lead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: { userId: string; name: string }[];
  lead?: (Partial<FormValues> & { id: string; nextFollowUpValue?: string | null }) | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = Boolean(lead?.id);

  const form = useForm<FormValues>({ resolver: zodResolver(leadSchema) });

  useEffect(() => {
    if (open) {
      form.reset({
        company: lead?.company ?? "",
        contactName: lead?.contactName ?? "",
        email: lead?.email ?? "",
        phone: lead?.phone ?? "",
        source: lead?.source ?? "",
        status: (lead?.status as FormValues["status"]) ?? "new",
        serviceInterest: lead?.serviceInterest ?? "",
        estimatedValue: (lead?.estimatedValue as FormValues["estimatedValue"]) ?? "",
        estimatedMrr: (lead?.estimatedMrr as FormValues["estimatedMrr"]) ?? "",
        ownerId: lead?.ownerId ?? "",
        nextFollowUpAt: lead?.nextFollowUpValue ?? "",
        notes: lead?.notes ?? "",
      });
    }
  }, [open, lead, form]);

  function onSubmit(values: FormValues) {
    setServerError(null);
    startTransition(async () => {
      const result = isEdit ? await updateLead(lead!.id, values) : await createLead(values);
      if (!result.ok) return setServerError(result.error);
      toast.success(isEdit ? "Lead updated" : "Lead created");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit lead" : "Add lead"}</DialogTitle>
          <DialogDescription>Track a potential client before it becomes a pipeline opportunity.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Company *</Label>
            <Input {...form.register("company")} placeholder="Peak Valley Landscaping" />
            {form.formState.errors.company && <p className="text-xs text-destructive">{form.formState.errors.company.message}</p>}
          </div>
          <div className="space-y-1"><Label>Contact name</Label><Input {...form.register("contactName")} /></div>
          <div className="space-y-1"><Label>Email</Label><Input {...form.register("email")} /></div>
          <div className="space-y-1"><Label>Phone</Label><Input {...form.register("phone")} /></div>
          <div className="space-y-1">
            <Label>Source</Label>
            <select {...form.register("source")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
              <option value="">—</option>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <select {...form.register("status")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
              {["new", "contacted", "qualified", "unqualified", "lost"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Owner</Label>
            <select {...form.register("ownerId")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label>Service interest</Label><Input {...form.register("serviceInterest")} placeholder="Google Ads, SEO" /></div>
          <div className="space-y-1">
            <Label>Estimated MRR (USD)</Label>
            <Input type="number" step="0.01" min="0" {...form.register("estimatedMrr")} />
          </div>
          <div className="space-y-1">
            <Label>One-time value (USD)</Label>
            <Input type="number" step="0.01" min="0" {...form.register("estimatedValue")} />
          </div>
          <div className="space-y-1">
            <Label>Next follow-up</Label>
            <Input type="date" {...form.register("nextFollowUpAt")} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Notes</Label>
            <Textarea rows={2} {...form.register("notes")} />
          </div>
          {serverError && <p className="col-span-2 text-sm text-destructive">{serverError}</p>}
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save lead" : "Create lead"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
