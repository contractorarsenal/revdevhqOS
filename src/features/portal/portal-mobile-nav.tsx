"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Users, Menu, LogOut, LifeBuoy, TrendingUp, FileBarChart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/** The client portal's own mobile nav — deliberately separate from the
 * internal MobileBottomNav/MoreMenuSheet and never imports from
 * components/layout. "Overview" and "Leads" are real destinations; Support
 * and Rankings/Reports are surfaced as Coming Soon inside More rather than
 * as dead links (see PortalOverview's own futureModules list, which this
 * mirrors). */
const COMING_SOON = [
  { label: "Support", icon: LifeBuoy },
  { label: "Google Rankings", icon: TrendingUp },
  { label: "Progress Reports", icon: FileBarChart },
];

const PRIMARY_TABS = [
  { href: "/portal", label: "Overview", icon: Home },
  { href: "/portal/leads", label: "Leads", icon: Users },
];

export function PortalMobileNav({ accent }: { accent: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex min-h-16 items-stretch border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        {PRIMARY_TABS.map((tab) => {
          const active = tab.href === "/portal" ? pathname === "/portal" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className="flex min-w-11 flex-1 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
              style={active ? { color: accent } : undefined}
            >
              <tab.icon className="size-5" aria-hidden />
              <span className={cn("text-[10.5px] font-medium leading-none", active && "font-semibold")}>{tab.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          aria-label="More"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="flex min-w-11 flex-1 flex-col items-center justify-center gap-1 text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <Menu className="size-5" aria-hidden />
          <span className="text-[10.5px] font-medium leading-none">More</span>
        </button>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-2">
            <div>
              <p className="mb-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Coming soon
              </p>
              <div className="flex flex-col gap-0.5">
                {COMING_SOON.map((item) => (
                  <div
                    key={item.label}
                    className="flex min-h-11 items-center gap-3 rounded-md px-2.5 text-[13.5px] font-medium text-muted-foreground"
                  >
                    <item.icon className="size-4.5" aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Coming soon
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <p className="mb-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Account
              </p>
              <Link
                href="/portal#account"
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center gap-3 rounded-md px-2.5 text-[13.5px] font-medium text-foreground/90 transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 dark:hover:bg-white/5"
              >
                Your account
              </Link>
              <button
                type="button"
                onClick={async () => {
                  setOpen(false);
                  await createClient().auth.signOut();
                  router.push("/sign-in");
                  router.refresh();
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 text-[13.5px] font-medium text-destructive transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 dark:hover:bg-white/5"
              >
                <LogOut className="size-4.5" aria-hidden />
                Sign out
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
