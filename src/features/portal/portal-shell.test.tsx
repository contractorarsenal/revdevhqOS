// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/portal",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { PortalShell } from "./portal-shell";

describe("PortalShell", () => {
  it("truncates a very long client business name in the header", () => {
    const longName = "B".repeat(150) + " Roofing & Restoration Contractors LLC";
    render(
      <PortalShell businessName={longName} accent="#DC2626">
        <div>content</div>
      </PortalShell>
    );
    const heading = screen.getByText(longName);
    expect(heading.className).toContain("truncate");
  });

  it("renders the portal mobile nav by default", () => {
    render(
      <PortalShell businessName="Acme Roofing" accent="#DC2626">
        <div>content</div>
      </PortalShell>
    );
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
  });

  it("suppresses the portal mobile nav when showNav=false (internal preview route)", () => {
    render(
      <PortalShell businessName="Acme Roofing" accent="#DC2626" showNav={false}>
        <div>content</div>
      </PortalShell>
    );
    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
  });
});
