"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PORTAL_NAV, PORTAL_MOBILE_TABS, PORTAL_MOBILE_MORE, portalNavActive } from "./nav";

function Brand({ clientName }: { clientName: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span aria-hidden className="block size-2.5 shrink-0 bg-primary" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">Contractor Arsenal</span>
      </div>
      <p className="mt-1 truncate text-[13px] font-semibold text-foreground">{clientName}</p>
      <p className="text-[11px] text-muted-foreground">Client portal</p>
    </div>
  );
}

export function ClientPortalShell({
  clientName, userName, children, staticNav = false,
}: {
  clientName: string;
  userName?: string;
  children: React.ReactNode;
  /** Staff preview: nav is visual only and there is no sign-out. */
  staticNav?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/clientportal/signin");
    router.refresh();
  }

  const navLink = (item: (typeof PORTAL_NAV)[number], onNavigate?: () => void) => {
    const active = portalNavActive(pathname, item.href);
    const cls = cn(
      "relative flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
      active && "bg-accent text-foreground before:absolute before:inset-y-1.5 before:-left-2.5 before:w-0.5 before:bg-primary"
    );
    const inner = (<><item.icon className={cn("size-4", active && "text-primary")} aria-hidden />{item.label}</>);
    return staticNav
      ? <span key={item.href} className={cls}>{inner}</span>
      : <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cls}>{inner}</Link>;
  };

  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 lg:flex">
        <Brand clientName={clientName} />
        <nav aria-label="Client portal" className="mt-6 flex flex-col gap-0.5 pl-2.5">
          {PORTAL_NAV.map((item) => navLink(item))}
        </nav>
        <div className="mt-auto flex items-center gap-2 border-t border-sidebar-border pt-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold">{userName ?? "Preview"}</p>
            <p className="text-[11px] text-muted-foreground">Signed in</p>
          </div>
          <ThemeToggle />
          {!staticNav && (
            <button onClick={signOut} aria-label="Sign out" title="Sign out" className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <LogOut className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* mobile / tablet top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <Brand clientName={clientName} />
          <div className="ml-auto"><ThemeToggle /></div>
        </header>
        <main className={cn("mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8", !staticNav && "pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-8")}>
          {children}
        </main>
      </div>

      {/* mobile bottom nav */}
      {!staticNav && (
        <>
          <nav aria-label="Client portal" className="fixed inset-x-0 bottom-0 z-40 flex min-h-16 items-stretch border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
            {PORTAL_MOBILE_TABS.map((item) => {
              const active = portalNavActive(pathname, item.href);
              return (
                <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                  className={cn("flex min-w-11 flex-1 flex-col items-center justify-center gap-1 text-muted-foreground", active && "text-primary")}>
                  <item.icon className="size-5" aria-hidden />
                  <span className={cn("text-[10.5px] font-medium leading-none", active && "font-semibold")}>{item.label}</span>
                </Link>
              );
            })}
            <button type="button" aria-label="More" aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}
              className="flex min-w-11 flex-1 flex-col items-center justify-center gap-1 text-muted-foreground">
              <Menu className="size-5" aria-hidden />
              <span className="text-[10.5px] font-medium leading-none">More</span>
            </button>
          </nav>
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <SheetHeader><SheetTitle>Menu</SheetTitle></SheetHeader>
              <div className="flex flex-col gap-0.5 px-4 pb-2">
                {PORTAL_MOBILE_MORE.map((item) => (
                  <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)}
                    className="flex min-h-11 items-center gap-3 rounded-sm px-2.5 text-[13.5px] font-medium text-foreground/90 hover:bg-accent">
                    <item.icon className="size-4.5" aria-hidden /> {item.label}
                  </Link>
                ))}
                <button onClick={signOut} className="mt-1 flex min-h-11 items-center gap-3 rounded-sm px-2.5 text-[13.5px] font-medium text-destructive hover:bg-accent">
                  <LogOut className="size-4.5" aria-hidden /> Sign out
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}
