import { cn } from "@/lib/utils";

const TONES = {
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  red: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
  indigo: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
} as const;

type Tone = keyof typeof TONES;

const STATUS_TONE: Record<string, Tone> = {
  active: "green", paid: "green", succeeded: "green", completed: "green", won: "green", converted: "green",
  onboarding: "amber", trial: "amber", pending: "amber", qualified: "amber", contacted: "amber", in_progress: "indigo",
  past_due: "red", failed: "red", overdue: "red", lost: "red", urgent: "red", unqualified: "red",
  open: "indigo", new: "indigo", todo: "indigo", high: "amber", medium: "neutral", low: "neutral",
  draft: "neutral", paused: "neutral", canceled: "neutral", archived: "neutral", void: "neutral", refunded: "neutral",
};

export function StatusBadge({ status, tone }: { status: string; tone?: Tone }) {
  const resolved = tone ?? STATUS_TONE[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
        TONES[resolved]
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status.replace(/_/g, " ")}
    </span>
  );
}
