// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { PortalMobileNav } from "./portal-mobile-nav";
import { SIDEBAR_PRIMARY_NAV, SIDEBAR_SECONDARY_NAV } from "@/components/layout/nav-items";

describe("PortalMobileNav", () => {
  it("exposes Overview, the now-live Leads tab, and More — and only ever links to portal routes", () => {
    render(<PortalMobileNav accent="#DC2626" />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav.textContent).toContain("Overview");
    expect(nav.textContent).toContain("Leads");
    expect(nav.textContent).toContain("More");

    // The label "Leads" is shared with the internal sidebar, so the invariant
    // that actually matters is by HREF, not text: every real tab links under
    // /portal and never at an internal Command Center route (internal Leads is
    // "/leads"; the portal's own Leads tab is "/portal/leads").
    const internalHrefs = new Set([...SIDEBAR_PRIMARY_NAV, ...SIDEBAR_SECONDARY_NAV].map((i) => i.href));
    const links = [...nav.querySelectorAll("a")];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      expect(href.startsWith("/portal")).toBe(true);
      expect(internalHrefs.has(href)).toBe(false);
    }
  });

  it("routes the Leads tab to /portal/leads", () => {
    render(<PortalMobileNav accent="#DC2626" />);
    expect(screen.getByRole("link", { name: /Leads/ })).toHaveAttribute("href", "/portal/leads");
  });

  it("marks Overview active on /portal", () => {
    render(<PortalMobileNav accent="#DC2626" />);
    expect(screen.getByRole("link", { name: /Overview/ })).toHaveAttribute("aria-current", "page");
  });

  it("More opens a sheet listing only Coming Soon modules, Account, and Sign out — never an internal route", async () => {
    const user = userEvent.setup();
    render(<PortalMobileNav accent="#DC2626" />);
    await user.click(screen.getByRole("button", { name: "More" }));
    const dialog = await screen.findByRole("dialog");

    expect(dialog.textContent).toContain("Coming soon");
    expect(dialog.textContent).toContain("Your account");
    expect(screen.getByRole("button", { name: /Sign out/ })).toBeInTheDocument();

    // "Leads" appears as inert Coming Soon text (matching PortalOverview's
    // own futureModules label) — the invariant that matters is that no link
    // in the portal drawer points at an internal Command Center route.
    const internalHrefs = new Set([...SIDEBAR_PRIMARY_NAV, ...SIDEBAR_SECONDARY_NAV].map((i) => i.href));
    for (const link of dialog.querySelectorAll("a")) {
      expect(internalHrefs.has(link.getAttribute("href") ?? "")).toBe(false);
    }
  });
});
