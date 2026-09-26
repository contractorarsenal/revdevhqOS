import {
  LayoutGrid, Users, Target, Kanban, CreditCard, CheckSquare, BarChart3,
  Receipt, CalendarDays, FolderKanban, Goal, ClipboardList, Settings,
  Menu, Gavel, MessageSquareText,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: typeof LayoutGrid };
export type NavGroup = { label: string; items: NavItem[] };

/** Single source of truth for internal navigation (desktop island sidebar,
 * tablet drawer, and the mobile "More" sheet all derive from it). Order and
 * grouping are intentional and covered by a unit test — change both
 * together. The client portal has its own navigation and never uses this. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Main",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
      { href: "/clients", label: "Clients", icon: Users },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/approvals", label: "Needs Jay", icon: Gavel },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/leads", label: "Leads", icon: Target },
      { href: "/pipeline", label: "Pipeline", icon: Kanban },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/client-requests", label: "Client requests", icon: MessageSquareText },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/billing", label: "Billing", icon: CreditCard },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/expenses", label: "Expenses", icon: Receipt },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/goals", label: "Goals", icon: Goal },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/onboarding", label: "Onboarding", icon: ClipboardList },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** The "Main" group (the daily operating loop) and everything else, kept as
 * flat lists for callers/tests that only need membership. */
export const SIDEBAR_PRIMARY_NAV: NavItem[] = NAV_GROUPS[0].items;
export const SIDEBAR_SECONDARY_NAV: NavItem[] = NAV_GROUPS.slice(1).flatMap((g) => g.items);

/** The 5 destinations in the mobile bottom tab bar. "More" is not a route —
 * it opens the full-navigation sheet instead of navigating. Needs Jay gets
 * a persistent tab because pending approvals are time-sensitive. */
export const MOBILE_PRIMARY_NAV = [
  { href: "/dashboard", label: "Home", icon: LayoutGrid },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/approvals", label: "Needs Jay", icon: Gavel },
  { href: "/more", label: "More", icon: Menu },
] as const;

export type MoreMenuGroup = NavGroup;

/** Contents of the mobile "More" sheet: every destination that is not
 * already a bottom tab, in the same groups as the desktop sidebar. */
const TAB_HREFS = new Set<string>(MOBILE_PRIMARY_NAV.map((i) => i.href));
export const MORE_MENU_GROUPS: MoreMenuGroup[] = NAV_GROUPS
  .map((g) => ({ label: g.label === "Main" ? "Work" : g.label, items: g.items.filter((i) => !TAB_HREFS.has(i.href)) }))
  .filter((g) => g.items.length > 0);

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

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

/** Best-effort page title for the compact mobile/tablet header, derived
 * from the same nav data so it never drifts from the sidebar labels. */
export function getPageTitle(pathname: string): string {
  const match = ALL_NAV_ITEMS.find((item) => matchesNavHref(pathname, item.href));
  return match?.label ?? "CA Command Center";
}

/** Group label (Main / Sales / …) for a pathname — used as quiet breadcrumb context. */
export function getPageGroup(pathname: string): string | null {
  return NAV_GROUPS.find((g) => g.items.some((item) => matchesNavHref(pathname, item.href)))?.label ?? null;
}
