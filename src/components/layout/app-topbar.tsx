import Link from "next/link";
import { Plus, UserPlus, Target, Kanban, FileText, DollarSign, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const QUICK_ADD = [
  { href: "/clients?new=1", label: "Add client", icon: UserPlus },
  { href: "/leads?new=1", label: "Add lead", icon: Target },
  { href: "/pipeline?new=1", label: "Add opportunity", icon: Kanban },
  { href: "/billing?tab=invoices&new=1", label: "Create invoice", icon: FileText },
  { href: "/billing?tab=payments&new=1", label: "Record payment", icon: DollarSign },
  { href: "/tasks?new=1", label: "Add task", icon: CheckSquare },
];

export function AppTopbar({ workspaceName, userName }: { workspaceName: string; userName: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-[52px] items-center gap-3 border-b border-border bg-card px-5">
      <p className="text-[13px] text-muted-foreground">
        <span className="font-medium text-foreground">{workspaceName}</span>
      </p>
      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="size-3.5" /> Quick Add
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
        <div className="flex size-7 items-center justify-center rounded-full bg-primary text-[10.5px] font-semibold text-primary-foreground">
          {userName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
        </div>
      </div>
    </header>
  );
}
