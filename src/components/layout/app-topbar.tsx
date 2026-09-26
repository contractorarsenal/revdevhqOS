"use client";

import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { TabletNavDrawer } from "@/components/layout/tablet-nav-drawer";
import { QuickAdd } from "@/components/layout/quick-add";
import { getPageGroup, getPageTitle } from "@/components/layout/nav-items";

/** Page header. It is part of the content area, not a second full-width
 * navigation bar: no fill or divider, quiet breadcrumb on the left, actions
 * on the right. Phones get the title plus a floating Quick Add instead. */
export function AppTopbar({ workspaceName, userName, role }: { workspaceName: string; userName: string; role: string }) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const group = getPageGroup(pathname);
  const initials = userName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="z-30 flex h-12 shrink-0 items-center gap-2 px-4 sm:px-6 lg:h-14 lg:pr-3">
      <TabletNavDrawer workspaceName={workspaceName} userName={userName} role={role} />
      <div className="min-w-0 flex-1">
        {/* Phones/tablets: page title with the (truncating) workspace as caption. */}
        <div className="lg:hidden">
          <p className="truncate text-[15px] font-semibold leading-tight tracking-tight">{title}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">{workspaceName}</p>
        </div>
        {/* Desktop: quiet breadcrumb — the page's own heading stays the loudest element. */}
        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground lg:flex">
          <span className="truncate">{workspaceName}</span>
          {group && group !== "Main" && (<><span aria-hidden className="text-muted-foreground/50">/</span><span className="truncate">{group}</span></>)}
          <span aria-hidden className="text-muted-foreground/50">/</span>
          <span className="truncate font-medium text-foreground">{title}</span>
        </nav>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <QuickAdd />
        <ThemeToggle />
        <div
          title={`${userName} · ${role}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground"
        >
          {initials}
        </div>
      </div>
    </header>
  );
}
