"use client";

import Link from "next/link";
import { Plus, UserPlus, Target, Kanban, FileText, DollarSign, CheckSquare, ListPlus } from "lucide-react";
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
  { href: "/billing?tab=payments&bulk=1", label: "Bulk add payments", icon: ListPlus },
  { href: "/tasks?new=1", label: "Add task", icon: CheckSquare },
];

/** Quick Add. One trigger, shown at every width: a labelled button from md
 * up and a compact icon button on phones. It lives in the page header rather
 * than floating over content, so it can never cover a link or control. */
export function QuickAdd() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" aria-label="Quick Add" className="gap-1.5 px-2.5 md:px-3">
          <Plus className="size-4 md:size-3.5" /> <span className="hidden md:inline">Quick Add</span>
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
  );
}
