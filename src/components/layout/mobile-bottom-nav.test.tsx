// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { MobileBottomNav } from "./mobile-bottom-nav";

describe("MobileBottomNav", () => {
  it("renders exactly the 5 primary destinations in order", () => {
    render(<MobileBottomNav />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const items = nav.querySelectorAll(":scope > a, :scope > button");
    expect(items).toHaveLength(5);
    expect(Array.from(items).map((el) => el.textContent)).toEqual([
      "Dashboard", "Leads", "Clients", "Calendar", "More",
    ]);
  });

  it("marks the active route with aria-current", () => {
    render(<MobileBottomNav />);
    const dashboardLink = screen.getByRole("link", { name: /Dashboard/ });
    expect(dashboardLink).toHaveAttribute("aria-current", "page");
    const leadsLink = screen.getByRole("link", { name: /Leads/ });
    expect(leadsLink).not.toHaveAttribute("aria-current");
  });

  it("respects the iPhone safe-area inset in its bottom padding", () => {
    render(<MobileBottomNav />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav.className).toContain("safe-area-inset-bottom");
  });

  it("has no nested interactive elements", () => {
    render(<MobileBottomNav />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const interactive = nav.querySelectorAll("a, button");
    for (const el of interactive) {
      expect(el.querySelector("a, button")).toBeNull();
    }
  });

  it("opens the More sheet when the More tab is pressed", async () => {
    const user = userEvent.setup();
    render(<MobileBottomNav />);
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Menu" })).toBeInTheDocument();
  });
});
