"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { taskSchema } from "@/lib/validation";
import { createTask, updateTask } from "@/server/actions/tasks";
import { createCalendarEvent } from "@/server/actions/calendar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FormValues = z.input<typeof taskSchema>;

export type RelatedOptions = {
  members: { userId: string; name: string }[];
  clients: { id: string; name: string }[];
  leads: { id: string; company: string }[];
  opportunities: { id: string; name: string }[];
};

export function TaskFormDialog({
  open, onOpenChange, options, task, fixedClientId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: RelatedOptions;
  task?: (Partial<FormValues> & { id: string; dueDateValue?: string | null }) | null;
  fixedClientId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = Boolean(task?.id);

  const form = useForm<FormValues>({ resolver: zodResolver(taskSchema) });
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [eventStart, setEventStart] = useState("09:00");
  const [eventEnd, setEventEnd] = useState("10:00");

  useEffect(() => {
    if (open) {
      form.reset({
        title: task?.title ?? "",
        description: task?.description ?? "",
        status: (task?.status as FormValues["status"]) ?? "todo",
        priority: (task?.priority as FormValues["priority"]) ?? "medium",
        assigneeId: task?.assigneeId ?? "",
        clientId: fixedClientId ?? task?.clientId ?? "",
        leadId: task?.leadId ?? "",
        opportunityId: task?.opportunityId ?? "",
        dueDate: task?.dueDateValue ?? "",
      });
    }
  }, [open, task, fixedClientId, form]);

  function onSubmit(values: FormValues) {
    setServerError(null);
    const payload = {
      ...values,
      clientId: values.clientId || null,
      leadId: values.leadId || null,
      opportunityId: values.opportunityId || null,
    };
    startTransition(async () => {
      const result = isEdit ? await updateTask(task!.id, payload) : await createTask(payload);
      if (!result.ok) return setServerError(result.error);
      if (!isEdit && addToCalendar) {
        await createCalendarEvent({
          title: values.title,
          clientId: values.clientId || null,
          date: eventDate,
          startTime: eventStart,
          endTime: eventEnd,
          assigneeId: values.assigneeId || null,
          status: "scheduled",
        });
      }
      toast.success(isEdit ? "Task updated" : addToCalendar ? "Task created and added to calendar" : "Task created");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit task" : "Add task"}</DialogTitle>
          <DialogDescription>Tasks can be linked to a client, lead, or opportunity.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Title *</Label>
            <Input {...form.register("title")} placeholder="Publish monthly report" />
            {form.formState.errors.title && <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>}
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Description</Label>
            <Textarea rows={2} {...form.register("description")} />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <select {...form.register("status")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
              {["todo", "in_progress", "completed", "canceled"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Priority</Label>
            <select {...form.register("priority")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
              {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Assignee</Label>
            <select {...form.register("assigneeId")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
              <option value="">Unassigned</option>
              {options.members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Due date</Label>
            <Input type="date" {...form.register("dueDate")} />
          </div>
          {!fixedClientId && (
            <>
              <div className="space-y-1">
                <Label>Client</Label>
                <select {...form.register("clientId")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                  <option value="">None</option>
                  {options.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Lead</Label>
                <select {...form.register("leadId")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                  <option value="">None</option>
                  {options.leads.map((l) => <option key={l.id} value={l.id}>{l.company}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Opportunity</Label>
                <select {...form.register("opportunityId")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                  <option value="">None</option>
                  {options.opportunities.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            </>
          )}
          {!isEdit && (
            <div className="col-span-2 space-y-2 rounded-md border border-border p-2.5">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={addToCalendar} onChange={(e) => setAddToCalendar(e.target.checked)} className="accent-primary" />
                Add to Calendar
              </label>
              {addToCalendar && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Date</Label>
                    <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Start</Label>
                    <Input type="time" value={eventStart} onChange={(e) => setEventStart(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End</Label>
                    <Input type="time" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}
          {serverError && <p className="col-span-2 text-sm text-destructive">{serverError}</p>}
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save task" : "Create task"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
