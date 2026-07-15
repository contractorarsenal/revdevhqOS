"use client";

import { useRouter } from "next/navigation";
import type { ReportableMonth } from "@/server/queries/monthly-report";

export function MonthSelector({ months, selectedValue }: { months: ReportableMonth[]; selectedValue: string }) {
  const router = useRouter();
  return (
    <select
      value={selectedValue}
      onChange={(e) => router.push(`/reports/monthly?month=${e.target.value}`)}
      className="h-8 rounded-md border border-input bg-transparent px-2.5 text-xs font-medium"
      aria-label="Select month"
    >
      {months.map((m) => (
        <option key={m.value} value={m.value}>
          {m.offset === 0 ? `${m.label} (this month)` : m.offset === -1 ? `${m.label} (last month)` : m.label}
        </option>
      ))}
    </select>
  );
}
