"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { projectSchema } from "@/lib/validation";
import { createProject, updateProject } from "@/server/actions/projects";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = z.input<typeof projectSchema>;
const COLORS = ["#4F46E5", "#0D9488", "#B45309", "#BE185D", "#0369A1", "#15803D"];

export function ProjectFormDialog({
  open, onOpenChange, members, clients, project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: { userId: string; name: string }[];
  clients: { id: string; name: string }[];
  project?: { id: string; name: string; description: string | null; status: string; ownerId: string | null; clientId: string | null; startDate: string | null; dueDate: string | null; color: string | null } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = Boolean(project?.id);
  const form = useForm<FormValues>({ resolver: zodResolver(projectSchema) });

  useEffect(() => {
    if (open) {
      setServerError(null);
      form.reset({
        name: project?.name ?? "",
        description: project?.description ?? "",
        status: (project?.status as FormValues["status"]) ?? "planning",
        ownerId: project?.ownerId ?? "",
        clientId: project?.clientId ?? "",
        startDate: project?.startDate ?? "",
        dueDate: project?.dueDate ?? "",
        color: project?.color ?? COLORS[0],
      });
    }
  }, [open, project, form]);

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = isEdit ? await updateProject(project!.id, values) : await createProject(values);
      if (!result.ok) return setServerError(result.error);
      toast.success(isEdit ? "Project updated" : "Project created");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input {...form.register("name")} placeholder="Contractor Arsenal website" />
            {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input {...form.register("description")} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <select {...form.register("status")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                {["planning", "active", "on_hold", "completed", "archived"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Owner</Label>
              <select {...form.register("ownerId")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                <option value="">Unassigned</option>
                {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Start date</Label>
              <Input type="date" {...form.register("startDate")} />
            </div>
            <div className="space-y-1">
              <Label>Due date</Label>
              <Input type="date" {...form.register("dueDate")} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Client <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <select {...form.register("clientId")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
              <option value="">None — internal project</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Color</Label>
            <div className="flex gap-1.5">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => form.setValue("color", c)} className="size-6 rounded-full" style={{ backgroundColor: c, outline: form.watch("color") === c ? `2px solid ${c}` : "none" }} />
              ))}
            </div>
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save changes" : "Create project"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
