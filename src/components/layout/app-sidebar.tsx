"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/layout/sign-out-button";

import { SIDEBAR_PRIMARY_NAV as PRIMARY, SIDEBAR_SECONDARY_NAV as SECONDARY } from "./nav-items";

function NavPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span className="ml-auto size-1.5 animate-pulse rounded-full bg-primary" aria-label="Loading" />;
}

function NavItem({ href, label, icon: Icon }: (typeof PRIMARY)[number]) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5",
        active &&
          "bg-sidebar-accent font-semibold text-foreground before:absolute before:-left-1.5 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-primary"
      )}
    >
      <Icon className={cn("size-4", active && "text-primary")} />
      {label}
      <NavPending />
    </Link>
  );
}

export function AppSidebar(props: {
  workspaceName: string;
  userName: string;
  userEmail: string;
  role: string;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-sidebar-border bg-sidebar px-2.5 py-4 lg:flex">
      <div className="mb-3 flex items-center gap-2 px-2">
        <div className="flex size-[22px] items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">r</div>
        <span className="text-[13.5px] font-semibold tracking-tight">
          revdevhq<span className="font-medium text-muted-foreground">OS</span>
        </span>
      </div>
      <div className="mb-3 rounded-lg border border-border bg-card px-2.5 py-2 shadow-sm">
        <p className="truncate text-[12.5px] font-semibold">{props.workspaceName}</p>
        <p className="text-[11px] text-muted-foreground">Marketing Agency</p>
      </div>
      <nav className="flex flex-col gap-0.5">
        {PRIMARY.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>
      <p className="px-2.5 pb-1 pt-4 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        Workspace
      </p>
      <nav className="flex flex-col gap-0.5">
        {SECONDARY.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>
      <div className="mt-auto border-t border-sidebar-border pt-3">
        <div className="flex items-center gap-2 px-2">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
            {props.userName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold leading-tight">{props.userName}</p>
            <p className="truncate text-[11px] capitalize leading-tight text-muted-foreground">{props.role}</p>
          </div>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
