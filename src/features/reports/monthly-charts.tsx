"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GOAL_STATUS_STYLE } from "@/features/goals/goal-ui";
import type { GoalPaceStatus } from "@/lib/goals";

const money = (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`);

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-md">
      {label && <p className="mb-0.5 font-semibold">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="tabular-nums text-muted-foreground">
          {p.name}: <span className="font-semibold text-foreground">${p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

/** Revenue / Expenses / Profit for the selected month, side by side. Profit
 * renders in red when it's a loss — the only place color alone carries
 * meaning here, so the bar is also labeled with its signed value. */
export function RevenueExpenseProfitChart({
  revenue, expenses, profit,
}: {
  revenue: number;
  expenses: number;
  profit: number;
}) {
  const data = [
    { name: "Revenue", value: revenue, color: "var(--chart-1)" },
    { name: "Expenses", value: expenses, color: "var(--chart-3)" },
    { name: "Profit", value: profit, color: profit >= 0 ? "var(--chart-2)" : "var(--destructive)" },
  ];
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={money} tick={{ fontSize: 10.5, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={52} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--accent)", opacity: 0.4 }} />
        <Bar dataKey="value" name="Amount" radius={[4, 4, 0, 0]} maxBarSize={64}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Top clients by collected revenue this period. Capped at 8 rows so it
 * stays readable — the full breakdown is available in the table above it. */
export function RevenueByClientChart({ data }: { data: { clientName: string; amount: number }[] }) {
  const top = [...data].sort((a, b) => b.amount - a.amount).slice(0, 8);
  const height = Math.max(160, top.length * 34 + 40);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={top} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tickFormatter={money} tick={{ fontSize: 10.5, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="clientName"
          tick={{ fontSize: 11, fill: "var(--foreground)" }}
          axisLine={false}
          tickLine={false}
          width={110}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--accent)", opacity: 0.4 }} />
        <Bar dataKey="amount" name="Collected" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Lightweight goal-progress visual: a single wide bar, capped visually at
 * 100% while the label shows the real (possibly >100%) percentage — same
 * convention as the Goals feature's own progress bar. */
export function GoalProgressChart({ progressPct, status }: { progressPct: number; status: GoalPaceStatus }) {
  const width = Math.min(100, Math.max(0, progressPct));
  const style = GOAL_STATUS_STYLE[status];
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className={`text-2xl font-semibold tabular-nums ${style.text}`}>{Math.round(progressPct)}%</span>
        <span className="text-[11px] text-muted-foreground">of target</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-[width] ${style.bar}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
