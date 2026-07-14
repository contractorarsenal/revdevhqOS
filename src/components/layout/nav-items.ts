import {
  LayoutGrid, Users, Target, Kanban, CreditCard, CheckSquare, BarChart3,
  Receipt, CalendarDays, FolderKanban, Goal, ClipboardList, Settings,
  Menu,
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

export const SIDEBAR_SECONDARY_NAV = [
  { href: "/onboarding", label: "Onboarding", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** The 5 destinations in the mobile bottom tab bar. "More" is not a route —
 * it opens the full-navigation sheet instead of navigating. */
export const MOBILE_PRIMARY_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/leads", label: "Leads", icon: Target },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/more", label: "More", icon: Menu },
] as const;

export type MoreMenuGroup = { label: string; items: { href: string; label: string; icon: typeof LayoutGrid }[] };

/** Grouped contents of the mobile "More" sheet. Deliberately mirrors the
 * full desktop nav so nothing internal-only is unreachable on mobile. */
export const MORE_MENU_GROUPS: MoreMenuGroup[] = [
  {
    label: "Sales",
    items: [
      { href: "/pipeline", label: "Pipeline", icon: Kanban },
      { href: "/leads", label: "Leads", icon: Target },
      { href: "/clients", label: "Clients", icon: Users },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/goals", label: "Goals", icon: Goal },
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/projects", label: "Projects", icon: FolderKanban },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/billing", label: "Billing", icon: CreditCard },
      { href: "/expenses", label: "Expenses", icon: Receipt },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/onboarding", label: "Onboarding", icon: ClipboardList },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** True when `pathname` belongs to `href` — exact match or a nested route
 * (e.g. "/clients/123" belongs to "/clients"). Query strings never reach
 * here since Next's usePathname() already strips them. */
export function matchesNavHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Resolves which bottom-tab key should render active for a given pathname.
 * Routes not in the primary 5 (e.g. /goals, /billing) fall back to "more" so
 * the tab bar always shows a sensible active state. */
export function getActiveMobileTab(pathname: string): string {
  const primary = MOBILE_PRIMARY_NAV.find((item) => item.href !== "/more" && matchesNavHref(pathname, item.href));
  return primary?.href ?? "/more";
}

const ALL_NAV_ITEMS = [...SIDEBAR_PRIMARY_NAV, ...SIDEBAR_SECONDARY_NAV];

/** Best-effort page title for the compact mobile/tablet header, derived
 * from the same nav data so it never drifts from the sidebar labels. */
export function getPageTitle(pathname: string): string {
  const match = ALL_NAV_ITEMS.find((item) => matchesNavHref(pathname, item.href));
  return match?.label ?? "revdevhqOS";
}
