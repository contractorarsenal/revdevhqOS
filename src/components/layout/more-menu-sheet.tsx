"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { MORE_MENU_GROUPS, matchesNavHref } from "@/components/layout/nav-items";

/** Full secondary navigation for mobile — the More tab opens this. Grouped
 * to mirror how the desktop sidebar is organized, so nothing internal-only
 * is unreachable once the viewport narrows below the sidebar breakpoint. */
export function MoreMenuSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav aria-label="More" className="flex flex-col gap-4 px-4 pb-2">
          {MORE_MENU_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = matchesNavHref(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => onOpenChange(false)}
                      className={cn(
                        "flex min-h-11 items-center gap-3 rounded-md px-2.5 text-[13.5px] font-medium text-foreground/90 transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:hover:bg-white/5",
                        active && "bg-sidebar-accent font-semibold text-foreground"
                      )}
                    >
                      <item.icon className={cn("size-4.5", active && "text-primary")} aria-hidden />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="border-t border-border pt-3">
            <button
              type="button"
              onClick={async () => {
                onOpenChange(false);
                await createClient().auth.signOut();
                router.push("/sign-in");
                router.refresh();
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 text-[13.5px] font-medium text-destructive transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:hover:bg-white/5"
            >
              <LogOut className="size-4.5" aria-hidden />
              Sign out
            </button>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
