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
  it("only exposes Overview and More — no internal Command Center items", () => {
    render(<PortalMobileNav accent="#DC2626" />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav.textContent).toContain("Overview");
    expect(nav.textContent).toContain("More");

    const internalLabels = [...SIDEBAR_PRIMARY_NAV, ...SIDEBAR_SECONDARY_NAV].map((i) => i.label);
    for (const label of internalLabels) {
      expect(nav.textContent).not.toContain(label);
    }
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
