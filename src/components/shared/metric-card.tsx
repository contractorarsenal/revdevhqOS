export function MetricCard({
  label, value, hint,
}: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm">
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="tabular-nums mt-1 truncate text-[19px] font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function MetricGrid({ children }: { children: React.ReactNode }) {
  return <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{children}</div>;
}
