"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

/** Visible Dark/Light switch. Renders a stable placeholder until mounted so
 * server and client markup match (the real theme is only known client-side). */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const isDark = !mounted || resolvedTheme !== "light";
  const next = isDark ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      data-theme-toggle
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        className
      )}
    >
      {isDark ? <Sun className="size-3.5" aria-hidden /> : <Moon className="size-3.5" aria-hidden />}
    </button>
  );
}
