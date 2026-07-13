import {
  LayoutGrid, Users, Target, Kanban, CreditCard, CheckSquare, BarChart3,
  Receipt, CalendarDays, FolderKanban, Goal,
} from "lucide-react";

/** Internal sidebar order is intentional and covered by a unit test —
 * change both together. The client portal has its own separate navigation
 * (PortalShell) and never uses this list. */
export const SIDEBAR_PRIMARY_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/leads", label: "Leads", icon: Target },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/goals", label: "Goals", icon: Goal },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/projects", label: "Projects", icon: FolderKanban },
];
