// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { AppTopbar } from "./app-topbar";

describe("AppTopbar", () => {
  it("truncates a very long workspace name instead of pushing controls off-screen", () => {
    const longName = "A".repeat(120) + " Extremely Long Marketing Agency Name LLC";
    render(<AppTopbar workspaceName={longName} userName="Jane Doe" role="owner" />);
    const captions = screen.getAllByText(longName);
    for (const el of captions) {
      const truncated = el.closest(".truncate");
      expect(truncated).not.toBeNull();
    }
  });

  it("still renders Quick Add", () => {
    render(<AppTopbar workspaceName="Contractor Arsenal" userName="Jane Doe" role="owner" />);
    expect(screen.getByRole("button", { name: /Quick Add/ })).toBeInTheDocument();
  });
});
