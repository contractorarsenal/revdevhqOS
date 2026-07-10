"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { calendarEventSchema } from "@/lib/validation";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "@/server/actions/calendar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { Trash2 } from "lucide-react";

type FormValues = z.input<typeof calendarEventSchema>;
const COLORS = ["#4F46E5", "#0D9488", "#B45309", "#BE185D", "#0369A1", "#15803D"];

export type EventDefaults = {
  id?: string; title?: string; clientId?: string | null; date?: string;
  startTime?: string; endTime?: string; assigneeId?: string | null;
  color?: string | null; notes?: string | null; status?: string;
};

export function EventFormDialog({
  open, onOpenChange, defaults, clients, members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: EventDefaults | null;
  clients: { id: string; name: string }[];
  members: { userId: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = Boolean(defaults?.id);
  const form = useForm<FormValues>({ resolver: zodResolver(calendarEventSchema) });

  useEffect(() => {
    if (open) {
      setServerError(null);
      const now = new Date();
      form.reset({
        title: defaults?.title ?? "",
        clientId: defaults?.clientId ?? "",
        assigneeId: defaults?.assigneeId ?? "",
        date: defaults?.date ?? now.toISOString().slice(0, 10),
        startTime: defaults?.startTime ?? "09:00",
        endTime: defaults?.endTime ?? "10:00",
        color: defaults?.color ?? COLORS[0],
        notes: defaults?.notes ?? "",
        status: (defaults?.status as FormValues["status"]) ?? "scheduled",
      });
    }
  }, [open, defaults, form]);

  function onSubmit(values: FormValues) {
    setServerError(null);
    startTransition(async () => {
      const result = isEdit
        ? await updateCalendarEvent(defaults!.id!, values)
        : await createCalendarEvent(values);
      if (!result.ok) return setServerError(result.error);
      toast.success(isEdit ? "Event updated" : "Event scheduled");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Edit event" : "Schedule event"}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label>Title *</Label>
            <Input {...form.register("title")} placeholder="Pressure Wash" />
            {form.formState.errors.title && <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Client</Label>
            <select {...form.register("clientId")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
              <option value="">None</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" {...form.register("date")} />
            </div>
            <div className="space-y-1">
              <Label>Start *</Label>
              <Input type="time" {...form.register("startTime")} />
            </div>
            <div className="space-y-1">
              <Label>End *</Label>
              <Input type="time" {...form.register("endTime")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Assigned to</Label>
              <select {...form.register("assigneeId")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <select {...form.register("status")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                {["scheduled", "in_progress", "completed", "cancelled"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Color</Label>
            <div className="flex gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c} type="button" onClick={() => form.setValue("color", c)}
                  className="size-6 rounded-full ring-offset-2 ring-offset-background"
                  style={{ backgroundColor: c, outline: form.watch("color") === c ? `2px solid ${c}` : "none" }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Input {...form.register("notes")} placeholder="Optional" />
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter className="gap-2 sm:justify-between">
            {isEdit && (
              <ConfirmationDialog
                trigger={<Button type="button" variant="ghost" size="sm" className="gap-1.5 text-destructive"><Trash2 className="size-3.5" /> Delete</Button>}
                title="Delete this event?"
                description="This calendar event will be permanently removed."
                confirmLabel="Delete"
                destructive
                onConfirm={async () => {
                  const result = await deleteCalendarEvent(defaults!.id!);
                  if (!result.ok) toast.error(result.error);
                  else { toast.success("Event deleted"); onOpenChange(false); router.refresh(); }
                }}
              />
            )}
            <span className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save changes" : "Schedule"}</Button>
            </span>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
