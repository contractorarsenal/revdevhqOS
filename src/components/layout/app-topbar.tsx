"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, UserPlus, Target, Kanban, FileText, DollarSign, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TabletNavDrawer } from "@/components/layout/tablet-nav-drawer";
import { getPageTitle } from "@/components/layout/nav-items";

const QUICK_ADD = [
  { href: "/clients?new=1", label: "Add client", icon: UserPlus },
  { href: "/leads?new=1", label: "Add lead", icon: Target },
  { href: "/pipeline?new=1", label: "Add opportunity", icon: Kanban },
  { href: "/billing?tab=invoices&new=1", label: "Create invoice", icon: FileText },
  { href: "/billing?tab=payments&new=1", label: "Record payment", icon: DollarSign },
  { href: "/tasks?new=1", label: "Add task", icon: CheckSquare },
];

export function AppTopbar({ workspaceName, userName, role }: { workspaceName: string; userName: string; role: string }) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-[52px] items-center gap-2 border-b border-border bg-card px-3 sm:px-5">
      <TabletNavDrawer workspaceName={workspaceName} userName={userName} role={role} />
      {/* Below lg the sidebar is hidden, so the current page title is the
          primary orientation cue; the workspace name is demoted to a small
          caption so a long name can never push Quick Add off-screen. */}
      <div className="min-w-0 flex-1 lg:flex-initial">
        <p className="truncate text-[14px] font-semibold leading-tight text-foreground lg:hidden">{title}</p>
        <p className="hidden truncate text-[13px] text-muted-foreground lg:block">
          <span className="font-medium text-foreground">{workspaceName}</span>
        </p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground lg:hidden">{workspaceName}</p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1.5 px-2.5 sm:px-3">
              <Plus className="size-3.5" /> <span className="hidden sm:inline">Quick Add</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Quick add</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {QUICK_ADD.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href} className="flex items-center gap-2">
                  <item.icon className="size-4 text-muted-foreground" /> {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="hidden size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10.5px] font-semibold text-primary-foreground lg:flex">
          {userName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
        </div>
      </div>
    </header>
  );
}
