"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SIDEBAR_PRIMARY_NAV, SIDEBAR_SECONDARY_NAV, matchesNavHref } from "@/components/layout/nav-items";

/** Left-side drawer for tablet / small-laptop widths (`md` up to `lg`),
 * where there's no room for the full sidebar but the mobile bottom nav
 * would waste too much of the wider viewport. Contains the same items as
 * the desktop sidebar, in the same order. Radix Dialog underneath gives us
 * focus trapping, Escape-to-close, outside-click-to-close, and focus
 * restoration to the trigger for free. */
export function TabletNavDrawer({ workspaceName, userName, role }: { workspaceName: string; userName: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation menu" className="hidden md:inline-flex lg:hidden">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-72 flex-col p-0">
        <SheetHeader className="border-b border-border">
          <SheetTitle>{workspaceName}</SheetTitle>
        </SheetHeader>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 py-3">
          {SIDEBAR_PRIMARY_NAV.map((item) => {
            const active = matchesNavHref(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:hover:bg-white/5",
                  active && "bg-sidebar-accent font-semibold text-foreground"
                )}
              >
                <item.icon className={cn("size-4", active && "text-primary")} aria-hidden />
                {item.label}
              </Link>
            );
          })}
          <p className="px-2.5 pb-1 pt-4 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Workspace
          </p>
          {SIDEBAR_SECONDARY_NAV.map((item) => {
            const active = matchesNavHref(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:hover:bg-white/5",
                  active && "bg-sidebar-accent font-semibold text-foreground"
                )}
              >
                <item.icon className={cn("size-4", active && "text-primary")} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 px-1">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {userName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold leading-tight">{userName}</p>
              <p className="truncate text-[11px] capitalize leading-tight text-muted-foreground">{role}</p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Sign out"
              onClick={async () => {
                setOpen(false);
                await createClient().auth.signOut();
                router.push("/sign-in");
                router.refresh();
              }}
            >
              <LogOut className="size-3.5" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
