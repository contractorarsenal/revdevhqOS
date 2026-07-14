// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/clients/abc-123",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { TabletNavDrawer } from "./tablet-nav-drawer";
import { SIDEBAR_PRIMARY_NAV, SIDEBAR_SECONDARY_NAV } from "./nav-items";

describe("TabletNavDrawer", () => {
  it("is closed until the trigger is pressed, then shows the full desktop nav", async () => {
    const user = userEvent.setup();
    render(<TabletNavDrawer workspaceName="Contractor Arsenal" userName="Jane Doe" role="owner" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));
    const dialog = await screen.findByRole("dialog");
    for (const item of [...SIDEBAR_PRIMARY_NAV, ...SIDEBAR_SECONDARY_NAV]) {
      expect(within(dialog).getByRole("link", { name: new RegExp(item.label) })).toBeInTheDocument();
    }
  });

  it("highlights Clients for the nested client detail route", async () => {
    const user = userEvent.setup();
    render(<TabletNavDrawer workspaceName="Contractor Arsenal" userName="Jane Doe" role="owner" />);
    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));
    const clientsLink = await screen.findByRole("link", { name: /Clients/ });
    expect(clientsLink).toHaveAttribute("aria-current", "page");
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<TabletNavDrawer workspaceName="Contractor Arsenal" userName="Jane Doe" role="owner" />);
    const trigger = screen.getByRole("button", { name: "Open navigation menu" });
    await user.click(trigger);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes after selecting a link", async () => {
    const user = userEvent.setup();
    render(<TabletNavDrawer workspaceName="Contractor Arsenal" userName="Jane Doe" role="owner" />);
    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));
    await user.click(await screen.findByRole("link", { name: /Billing/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("exposes sign out inside the drawer", async () => {
    const user = userEvent.setup();
    render(<TabletNavDrawer workspaceName="Contractor Arsenal" userName="Jane Doe" role="owner" />);
    await user.click(screen.getByRole("button", { name: "Open navigation menu" }));
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});
