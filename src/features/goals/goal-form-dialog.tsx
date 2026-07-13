"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { goalSchema } from "@/lib/validation";
import { createGoal, updateGoal } from "@/server/actions/goals";
import { isManualMetric, METRIC_LABEL, type GoalMetricType, type GoalPeriodType } from "@/lib/goals";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = z.input<typeof goalSchema>;
const COLORS = ["#DC2626", "#4F46E5", "#0D9488", "#B45309", "#BE185D", "#0369A1"];
const METRICS = Object.keys(METRIC_LABEL) as GoalMetricType[];

export type GoalFormDefaults = {
  id: string;
  name: string;
  description: string | null;
  metricType: GoalMetricType;
  periodType: GoalPeriodType;
  periodStart: string;
  targetValue: number;
  color: string | null;
  isPrimary: boolean;
  customEnd?: string;
};

export function GoalFormDialog({
  open, onOpenChange, goal, today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** present when editing */
  goal?: GoalFormDefaults | null;
  /** workspace-local "YYYY-MM-DD", used for sensible period defaults */
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = Boolean(goal?.id);
  const form = useForm<FormValues>({ resolver: zodResolver(goalSchema) });

  useEffect(() => {
    if (open) {
      setServerError(null);
      const startMonth = goal?.periodStart?.slice(0, 7) ?? today.slice(0, 7);
      const startYear = Number((goal?.periodStart ?? today).slice(0, 4));
      const startMonthNum = Number((goal?.periodStart ?? today).slice(5, 7));
      form.reset({
        name: goal?.name ?? "",
        description: goal?.description ?? "",
        metricType: goal?.metricType ?? "revenue_collected",
        periodType: goal?.periodType ?? "monthly",
        targetValue: goal?.targetValue ?? ("" as unknown as number),
        month: startMonth,
        weekDate: goal?.periodStart ?? today,
        quarter: Math.floor((startMonthNum - 1) / 3) + 1,
        year: startYear,
        customStart: goal?.periodStart ?? today,
        customEnd: goal?.customEnd ?? "",
        color: goal?.color ?? COLORS[0],
        isPrimary: goal?.isPrimary ?? false,
        manualStartValue: "",
      });
    }
  }, [open, goal, today, form]);

  const periodType = form.watch("periodType") ?? "monthly";
  const metricType = (form.watch("metricType") ?? "revenue_collected") as GoalMetricType;
  const manual = isManualMetric(metricType);
  const err = form.formState.errors;

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = isEdit ? await updateGoal(goal!.id, values) : await createGoal(values);
      if (!result.ok) return setServerError(result.error);
      toast.success(isEdit ? "Goal updated" : "Goal created");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Edit goal" : "New goal"}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label>Goal name *</Label>
            <Input {...form.register("name")} placeholder="Monthly Revenue" />
            {err.name && <p className="text-xs text-destructive">{err.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input {...form.register("description")} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Metric *</Label>
              <select {...form.register("metricType")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                {METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
              </select>
              <p className="text-[11px] text-muted-foreground">
                {manual ? "Tracked manually — update progress as you go." : "Calculated automatically from your records."}
              </p>
            </div>
            <div className="space-y-1">
              <Label>Target *</Label>
              <Input type="number" step="any" min="0" {...form.register("targetValue")} placeholder={metricType === "revenue_collected" ? "10000" : "5"} />
              {err.targetValue && <p className="text-xs text-destructive">{err.targetValue.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Period *</Label>
              <select {...form.register("periodType")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                <option value="weekly">Weekly (Mon–Sun)</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
                <option value="custom">Custom range</option>
              </select>
            </div>
            {periodType === "monthly" && (
              <div className="space-y-1">
                <Label>Month *</Label>
                <Input type="month" {...form.register("month")} />
                {err.month && <p className="text-xs text-destructive">{err.month.message}</p>}
              </div>
            )}
            {periodType === "weekly" && (
              <div className="space-y-1">
                <Label>Any day in the week *</Label>
                <Input type="date" {...form.register("weekDate")} />
                {err.weekDate && <p className="text-xs text-destructive">{err.weekDate.message}</p>}
              </div>
            )}
            {periodType === "quarterly" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Quarter *</Label>
                  <select {...form.register("quarter")} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                    {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Year *</Label>
                  <Input type="number" {...form.register("year")} />
                </div>
              </div>
            )}
            {periodType === "annual" && (
              <div className="space-y-1">
                <Label>Year *</Label>
                <Input type="number" {...form.register("year")} />
                {err.year && <p className="text-xs text-destructive">{err.year.message}</p>}
              </div>
            )}
          </div>
          {periodType === "quarterly" && err.quarter && <p className="text-xs text-destructive">{err.quarter.message}</p>}
          {periodType === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start date *</Label>
                <Input type="date" {...form.register("customStart")} />
                {err.customStart && <p className="text-xs text-destructive">{err.customStart.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>End date *</Label>
                <Input type="date" {...form.register("customEnd")} />
                {err.customEnd && <p className="text-xs text-destructive">{err.customEnd.message}</p>}
              </div>
            </div>
          )}
          {manual && !isEdit && (
            <div className="space-y-1">
              <Label>Starting value</Label>
              <Input type="number" step="any" min="0" {...form.register("manualStartValue")} placeholder="0" />
              {err.manualStartValue && <p className="text-xs text-destructive">{err.manualStartValue.message}</p>}
            </div>
          )}
          <div className="space-y-1">
            <Label>Color</Label>
            <div className="flex gap-1.5">
              {COLORS.map((c) => (
                <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => form.setValue("color", c)} className="size-6 rounded-full" style={{ backgroundColor: c, outline: form.watch("color") === c ? `2px solid ${c}` : "none", outlineOffset: 2 }} />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" {...form.register("isPrimary")} className="accent-primary" />
            Make this the primary dashboard goal
          </label>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save changes" : "Create goal"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
