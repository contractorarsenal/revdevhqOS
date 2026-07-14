// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/goals/abc-123",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { MoreMenuSheet } from "./more-menu-sheet";

describe("MoreMenuSheet", () => {
  it("groups every secondary destination and includes sign out", () => {
    render(<MoreMenuSheet open onOpenChange={() => {}} />);
    for (const group of ["Sales", "Work", "Finance", "Account"]) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /Sign out/ })).toBeInTheDocument();
  });

  it("highlights the correct item for a nested route (goal detail)", () => {
    render(<MoreMenuSheet open onOpenChange={() => {}} />);
    const goalsLink = screen.getByRole("link", { name: /Goals/ });
    expect(goalsLink).toHaveAttribute("aria-current", "page");
  });

  it("closes after selecting a destination", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<MoreMenuSheet open onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("link", { name: /Billing/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<MoreMenuSheet open onOpenChange={onOpenChange} />);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
