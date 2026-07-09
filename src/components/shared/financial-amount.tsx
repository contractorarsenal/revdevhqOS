import { formatMoney } from "@/lib/finance/metrics";
import { cn } from "@/lib/utils";

export function FinancialAmount({
  value, className, suffix,
}: { value: string | number | null | undefined; className?: string; suffix?: string }) {
  return (
    <span className={cn("tabular-nums font-semibold", className)}>
      {formatMoney(value)}
      {suffix && <span className="text-[11px] font-normal text-muted-foreground">{suffix}</span>}
    </span>
  );
}
