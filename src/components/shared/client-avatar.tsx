import { cn } from "@/lib/utils";

const COLORS = ["#4F46E5", "#0D9488", "#B45309", "#BE185D", "#0369A1", "#7C3AED", "#15803D", "#B91C1C", "#475569"];

export function ClientAvatar({ name, className }: { name: string; className?: string }) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const initials = name
    .split(/[\s&]+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <span
      className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white", className)}
      style={{ backgroundColor: COLORS[hash % COLORS.length] }}
    >
      {initials || "?"}
    </span>
  );
}
