"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MOBILE_PRIMARY_NAV, getActiveMobileTab } from "@/components/layout/nav-items";
import { MoreMenuSheet } from "@/components/layout/more-menu-sheet";

/** Persistent bottom tab bar for narrow viewports (below `md`). Fixed height
 * of 4rem (16) — `(dashboard)/layout.tsx` pads main content by the same
 * amount so nothing renders underneath it. */
export function MobileBottomNav({ pendingApprovals = 0 }: { pendingApprovals?: number }) {
  const pathname = usePathname();
  const active = getActiveMobileTab(pathname);
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex min-h-16 items-stretch border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        {MOBILE_PRIMARY_NAV.map((item) => {
          const isMore = item.href === "/more";
          const isActive = active === item.href;
          const content = (
            <>
              <span className="relative">
                <item.icon className={cn("size-5", isActive && "text-primary")} aria-hidden />
                {item.href === "/approvals" && pendingApprovals > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-primary" aria-label="Pending items" />
                )}
              </span>
              <span className={cn("text-[10.5px] font-medium leading-none", isActive && "font-semibold text-primary")}>
                {item.label}
              </span>
            </>
          );
          const className = cn(
            "flex min-w-11 flex-1 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
            isActive && "text-primary"
          );

          if (isMore) {
            return (
              <button
                key={item.href}
                type="button"
                aria-label="More"
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setMoreOpen(true)}
                className={className}
              >
                {content}
              </button>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={className}
            >
              {content}
            </Link>
          );
        })}
      </nav>
      <MoreMenuSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}
