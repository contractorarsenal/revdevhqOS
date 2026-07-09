"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { toggleOnboardingStep } from "@/server/actions/clients";
import { ClientAvatar } from "@/components/shared/client-avatar";
import { Checkbox } from "@/components/ui/checkbox";

type Entry = {
  clientId: string;
  clientName: string;
  ownerName: string | null;
  startedAt: Date | string;
  steps: { id: string; name: string; position: number; completedAt: Date | string | null }[];
};

export function OnboardingBoard({ entries }: { entries: Entry[] }) {
  const router = useRouter();

  async function toggle(stepId: string, completed: boolean) {
    const result = await toggleOnboardingStep(stepId, completed);
    if (!result.ok) toast.error(result.error);
    else router.refresh();
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {entries.map((entry) => {
        const done = entry.steps.filter((s) => s.completedAt).length;
        const pct = Math.round((done / Math.max(1, entry.steps.length)) * 100);
        const current = entry.steps.find((s) => !s.completedAt);
        return (
          <section key={entry.clientId} className="rounded-lg border border-border bg-card shadow-sm">
            <header className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
              <ClientAvatar name={entry.clientName} />
              <div className="min-w-0 flex-1">
                <Link href={`/clients/${entry.clientId}`} className="truncate text-[13px] font-semibold hover:underline">
                  {entry.clientName}
                </Link>
                <p className="text-[11px] text-muted-foreground">
                  {entry.ownerName ?? "Unassigned"} · started {formatDistanceToNow(new Date(entry.startedAt), { addSuffix: true })}
                </p>
              </div>
              <span className="tabular-nums text-[11.5px] font-semibold text-muted-foreground">{pct}%</span>
            </header>
            <div className="px-4 pt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {current && <p className="mt-2 text-[11.5px] text-muted-foreground">Next: <span className="font-medium text-foreground">{current.name}</span></p>}
            </div>
            <ul className="px-4 py-3">
              {entry.steps.map((step) => (
                <li key={step.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 py-1">
                    <Checkbox checked={Boolean(step.completedAt)} onCheckedChange={(v) => toggle(step.id, v === true)} />
                    <span className={`text-[12.5px] ${step.completedAt ? "text-muted-foreground line-through" : ""}`}>{step.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
