import { describe, expect, it } from "vitest";
import {
  SIDEBAR_PRIMARY_NAV, SIDEBAR_SECONDARY_NAV, MOBILE_PRIMARY_NAV, MORE_MENU_GROUPS,
  matchesNavHref, getActiveMobileTab, getPageTitle,
} from "./nav-items";

describe("SIDEBAR_PRIMARY_NAV", () => {
  it("keeps the desktop sidebar order unchanged", () => {
    expect(SIDEBAR_PRIMARY_NAV.map((i) => i.href)).toEqual([
      "/dashboard", "/pipeline", "/leads", "/clients", "/calendar",
      "/billing", "/expenses", "/reports", "/goals", "/tasks", "/projects",
    ]);
  });
});

describe("MOBILE_PRIMARY_NAV", () => {
  it("contains exactly 5 items in the specified order", () => {
    expect(MOBILE_PRIMARY_NAV).toHaveLength(5);
    expect(MOBILE_PRIMARY_NAV.map((i) => i.label)).toEqual(["Dashboard", "Leads", "Clients", "Calendar", "More"]);
  });

  it("has no more than 5 primary destinations", () => {
    expect(MOBILE_PRIMARY_NAV.length).toBeLessThanOrEqual(5);
  });
});

describe("MORE_MENU_GROUPS", () => {
  it("only links to routes that already exist in the desktop nav (no dead links, no hidden unguarded routes)", () => {
    const authorizedHrefs = new Set([...SIDEBAR_PRIMARY_NAV, ...SIDEBAR_SECONDARY_NAV].map((i) => i.href));
    for (const group of MORE_MENU_GROUPS) {
      for (const item of group.items) {
        expect(authorizedHrefs.has(item.href)).toBe(true);
      }
    }
  });

  it("covers every desktop nav item except Dashboard, which the bottom tab bar already provides directly", () => {
    const moreHrefs = new Set(MORE_MENU_GROUPS.flatMap((g) => g.items.map((i) => i.href)));
    for (const item of [...SIDEBAR_PRIMARY_NAV, ...SIDEBAR_SECONDARY_NAV]) {
      if (item.href === "/dashboard") continue;
      expect(moreHrefs.has(item.href)).toBe(true);
    }
  });
});

describe("matchesNavHref (active-state resolution)", () => {
  it("matches an exact route", () => {
    expect(matchesNavHref("/dashboard", "/dashboard")).toBe(true);
  });
  it("matches a nested detail route", () => {
    expect(matchesNavHref("/clients/abc-123", "/clients")).toBe(true);
  });
  it("does not match unrelated routes", () => {
    expect(matchesNavHref("/clientsomething", "/clients")).toBe(false);
    expect(matchesNavHref("/billing", "/clients")).toBe(false);
  });
});

describe("getActiveMobileTab", () => {
  it("activates Dashboard for /dashboard", () => {
    expect(getActiveMobileTab("/dashboard")).toBe("/dashboard");
  });
  it("activates Leads for /leads (query strings are already stripped by usePathname)", () => {
    expect(getActiveMobileTab("/leads")).toBe("/leads");
  });
  it("activates Clients for a nested client detail route", () => {
    expect(getActiveMobileTab("/clients/abc-123")).toBe("/clients");
  });
  it("activates Calendar for /calendar", () => {
    expect(getActiveMobileTab("/calendar")).toBe("/calendar");
  });
  it("falls back to More for secondary routes like a goal detail page", () => {
    expect(getActiveMobileTab("/goals/abc-123")).toBe("/more");
    expect(getActiveMobileTab("/billing")).toBe("/more");
    expect(getActiveMobileTab("/settings")).toBe("/more");
  });
});

describe("getPageTitle", () => {
  it("resolves known routes to their nav label", () => {
    expect(getPageTitle("/clients/abc-123")).toBe("Clients");
    expect(getPageTitle("/goals")).toBe("Goals");
  });
  it("falls back to a default title for unknown routes", () => {
    expect(getPageTitle("/some-unmapped-route")).toBe("revdevhqOS");
  });
});
