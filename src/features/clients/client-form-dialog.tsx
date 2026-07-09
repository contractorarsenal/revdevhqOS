"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { clientSchema } from "@/lib/validation";
import { createClient, updateClient } from "@/server/actions/clients";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = z.input<typeof clientSchema>;

export type MemberOption = { userId: string; name: string };

export function ClientFormDialog({
  open, onOpenChange, members, client,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: MemberOption[];
  client?: (Partial<FormValues> & { id: string }) | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = Boolean(client?.id);

  const form = useForm<FormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: { status: "onboarding" },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: client?.name ?? "",
        website: client?.website ?? "",
        email: client?.email ?? "",
        phone: client?.phone ?? "",
        industry: client?.industry ?? "",
        address: client?.address ?? "",
        status: (client?.status as FormValues["status"]) ?? "onboarding",
        ownerId: client?.ownerId ?? "",
        startDate: client?.startDate ?? "",
      });
    }
  }, [open, client, form]);

  function onSubmit(values: FormValues) {
    setServerError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateClient(client!.id, values)
        : await createClient(values);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      toast.success(isEdit ? "Client updated" : "Client created");
      onOpenChange(false);
      router.refresh();
    });
  }

  const err = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit client" : "Add client"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the client record." : "Creates a client record in your workspace."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Company name *</Label>
            <Input {...form.register("name")} placeholder="Summit Roofing Co." />
            {err.name && <p className="text-xs text-destructive">{err.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Website</Label>
            <Input {...form.register("website")} placeholder="summitroofing.co" />
          </div>
          <div className="space-y-1">
            <Label>Industry</Label>
            <Input {...form.register("industry")} placeholder="Roofing contractor" />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input {...form.register("email")} placeholder="office@company.com" />
            {err.email && <p className="text-xs text-destructive">{err.email.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Phone</Label>
            <Input {...form.register("phone")} placeholder="(480) 555-0100" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Address</Label>
            <Input {...form.register("address")} placeholder="Street, city, state" />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <select {...form.register("status")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
              {["onboarding", "active", "past_due", "paused", "canceled"].map((s) => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Account owner</Label>
            <select {...form.register("ownerId")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Start date</Label>
            <Input type="date" {...form.register("startDate")} />
          </div>
          {!isEdit && (
            <>
              <div className="col-span-2 mt-1 border-t border-border pt-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Primary contact (optional)</p>
              </div>
              <div className="space-y-1">
                <Label>Contact name</Label>
                <Input {...form.register("contactName")} placeholder="Dana Whitfield" />
              </div>
              <div className="space-y-1">
                <Label>Contact email</Label>
                <Input {...form.register("contactEmail")} placeholder="dana@company.com" />
              </div>
              <div className="space-y-1">
                <Label>Contact phone</Label>
                <Input {...form.register("contactPhone")} />
              </div>
            </>
          )}
          {serverError && <p className="col-span-2 text-sm text-destructive">{serverError}</p>}
          <DialogFooter className="col-span-2 mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
