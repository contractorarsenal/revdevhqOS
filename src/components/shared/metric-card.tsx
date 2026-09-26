export function MetricCard({
  label, value, hint,
}: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 border-l border-t border-border/70 px-4 py-3">
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="tabular-nums mt-1 truncate text-[20px] font-semibold leading-tight tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function MetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="-ml-px -mt-px grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6">{children}</div>
    </div>
  );
}
