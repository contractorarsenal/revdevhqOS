import { describe, expect, it } from "vitest";
import {
  NAV_GROUPS, SIDEBAR_PRIMARY_NAV, SIDEBAR_SECONDARY_NAV, MOBILE_PRIMARY_NAV, MORE_MENU_GROUPS,
  matchesNavHref, getActiveMobileTab, getPageTitle, getPageGroup,
} from "./nav-items";

describe("NAV_GROUPS", () => {
  it("groups navigation as Main / Sales / Operations / Business / System in the agreed order", () => {
    expect(NAV_GROUPS.map((g) => [g.label, g.items.map((i) => i.href)])).toEqual([
      ["Main", ["/dashboard", "/clients", "/projects", "/tasks", "/approvals"]],
      ["Sales", ["/leads", "/pipeline"]],
      ["Operations", ["/client-requests", "/calendar", "/billing"]],
      ["Business", ["/expenses", "/reports", "/goals"]],
      ["System", ["/onboarding", "/settings"]],
    ]);
  });
  it("keeps every module reachable (no route dropped) and unique", () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toHaveLength(15);
    expect(SIDEBAR_PRIMARY_NAV.length + SIDEBAR_SECONDARY_NAV.length).toBe(15);
  });
  it("resolves the breadcrumb group for a route", () => {
    expect(getPageGroup("/pipeline")).toBe("Sales");
    expect(getPageGroup("/billing")).toBe("Operations");
    expect(getPageGroup("/clients/abc")).toBe("Main");
    expect(getPageGroup("/nope")).toBeNull();
  });
});

describe("MOBILE_PRIMARY_NAV", () => {
  it("contains exactly 5 items in the specified order", () => {
    expect(MOBILE_PRIMARY_NAV).toHaveLength(5);
    expect(MOBILE_PRIMARY_NAV.map((i) => i.label)).toEqual(["Home", "Clients", "Tasks", "Needs Jay", "More"]);
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

  it("covers every desktop nav item that is not already a bottom tab", () => {
    const moreHrefs = new Set(MORE_MENU_GROUPS.flatMap((g) => g.items.map((i) => i.href)));
    const tabHrefs = new Set<string>(MOBILE_PRIMARY_NAV.map((i) => i.href));
    for (const item of [...SIDEBAR_PRIMARY_NAV, ...SIDEBAR_SECONDARY_NAV]) {
      expect(moreHrefs.has(item.href) || tabHrefs.has(item.href)).toBe(true);
      if (tabHrefs.has(item.href)) expect(moreHrefs.has(item.href)).toBe(false);
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
  it("activates Tasks for /tasks (query strings are already stripped by usePathname)", () => {
    expect(getActiveMobileTab("/tasks")).toBe("/tasks");
  });
  it("activates Clients for a nested client detail route", () => {
    expect(getActiveMobileTab("/clients/abc-123")).toBe("/clients");
  });
  it("activates Needs Jay for /approvals", () => {
    expect(getActiveMobileTab("/approvals")).toBe("/approvals");
  });
  it("falls back to More for secondary routes like a goal detail page or calendar", () => {
    expect(getActiveMobileTab("/goals/abc-123")).toBe("/more");
    expect(getActiveMobileTab("/billing")).toBe("/more");
    expect(getActiveMobileTab("/settings")).toBe("/more");
    expect(getActiveMobileTab("/calendar")).toBe("/more");
    expect(getActiveMobileTab("/leads")).toBe("/more");
  });
});

describe("getPageTitle", () => {
  it("resolves known routes to their nav label", () => {
    expect(getPageTitle("/clients/abc-123")).toBe("Clients");
    expect(getPageTitle("/goals")).toBe("Goals");
  });
  it("falls back to a default title for unknown routes", () => {
    expect(getPageTitle("/some-unmapped-route")).toBe("CA Command Center");
  });
});
