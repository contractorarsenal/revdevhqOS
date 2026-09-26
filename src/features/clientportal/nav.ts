import { LayoutGrid, FolderKanban, MessageSquareText, Target, CreditCard, Files, UserCircle } from "lucide-react";

export const PORTAL_NAV = [
  { href: "/clientportal/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/clientportal/projects", label: "Projects", icon: FolderKanban },
  { href: "/clientportal/requests", label: "Requests", icon: MessageSquareText },
  { href: "/clientportal/leads", label: "Leads", icon: Target },
  { href: "/clientportal/billing", label: "Billing", icon: CreditCard },
  { href: "/clientportal/files", label: "Files", icon: Files },
  { href: "/clientportal/account", label: "Account", icon: UserCircle },
] as const;

/** Compact mobile bottom bar; the rest live behind "More". */
export const PORTAL_MOBILE_TABS = PORTAL_NAV.slice(0, 4);
export const PORTAL_MOBILE_MORE = PORTAL_NAV.slice(4);

export function portalNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
