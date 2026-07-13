"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateGoalProgress } from "@/server/actions/goals";
import { formatGoalValue } from "./goal-ui";
import type { GoalMetricType } from "@/lib/goals";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProgressGoal = { id: string; name: string; metricType: GoalMetricType; currentValue: number; targetValue: number };

/** Lightweight "Update Progress" for manual goals — sets the new current
 * value without making the user re-edit the whole goal. The form is keyed
 * by goal + value so each open starts fresh from the stored progress. */
export function UpdateProgressDialog({
  open, onOpenChange, goal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: ProgressGoal | null;
}) {
  return (
    <Dialog open={open && Boolean(goal)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Update progress</DialogTitle></DialogHeader>
        {goal && <ProgressForm key={`${goal.id}-${goal.currentValue}`} goal={goal} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function ProgressForm({ goal, onOpenChange }: { goal: ProgressGoal; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(String(goal.currentValue));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateGoalProgress(goal.id, { value, note });
      if (!result.ok) return setError(result.error);
      toast.success("Progress updated");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {goal.name} — currently {formatGoalValue(goal.currentValue, goal.metricType)} of {formatGoalValue(goal.targetValue, goal.metricType)}
      </p>
      <div className="space-y-1">
        <Label>New current value *</Label>
        <Input type="number" step="any" min="0" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      </div>
      <div className="space-y-1">
        <Label>Note</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional — e.g. 20 calls this afternoon" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Update progress"}</Button>
      </DialogFooter>
    </form>
  );
}
