"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/layout/sign-out-button";

import { NAV_GROUPS, matchesNavHref, type NavItem as NavItemT } from "./nav-items";

function NavPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span className="ml-auto size-1.5 animate-pulse rounded-full bg-primary" aria-label="Loading" />;
}

function NavItem({ href, label, icon: Icon, badge }: NavItemT & { badge?: boolean }) {
  const pathname = usePathname();
  const active = matchesNavHref(pathname, href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10",
        active &&
          "bg-sidebar-accent font-semibold text-foreground before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-primary"
      )}
    >
      <Icon className={cn("size-4", active && "text-primary")} />
      {label}
      {badge && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-primary" aria-label="Pending items" />}
      <NavPending />
    </Link>
  );
}

export function AppSidebar(props: {
  workspaceName: string;
  userName: string;
  userEmail: string;
  role: string;
  pendingApprovals?: number;
}) {
  return (
    <aside
      aria-label="Sidebar"
      className="hidden h-full w-[224px] shrink-0 flex-col overflow-y-auto rounded-xl border border-sidebar-border bg-sidebar p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_24px_-12px_rgba(0,0,0,0.25)] lg:flex"
    >
      <div className="flex items-center gap-2 px-2 pb-3 pt-1">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">CA</div>
        <div className="min-w-0 leading-tight">
          <p className="text-[13.5px] font-semibold tracking-tight">Command Center</p>
          <p className="truncate text-[11px] text-muted-foreground">{props.workspaceName}</p>
        </div>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            {group.label !== "Main" && (
              <p className="px-2.5 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
                {group.label}
              </p>
            )}
            {group.items.map((item) => (
              <NavItem key={item.href} {...item} badge={item.href === "/approvals" && (props.pendingApprovals ?? 0) > 0} />
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-auto pt-3">
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
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
