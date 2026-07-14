import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.resolve(__dirname, "..", "..", p), "utf8");

describe("navigation regression guards", () => {
  it("suspended/revoked portal members never reach a page that renders portal navigation", () => {
    // requireClientPortalUser() redirects suspended/revoked members to this
    // page (see src/lib/auth/session.ts + src/lib/portal.ts's
    // resolvePostLoginDestination). It must stay nav-free.
    const source = read("src/app/portal/access-denied/page.tsx");
    expect(source).not.toContain("PortalMobileNav");
    expect(source).not.toContain("PortalShell");
  });

  it("the internal dashboard layout renders the mobile bottom nav and reserves space for it", () => {
    const source = read("src/app/(dashboard)/layout.tsx");
    expect(source).toContain("MobileBottomNav");
    expect(source).toContain("safe-area-inset-bottom");
  });

  it("the internal portal-preview route disables the client portal's own nav (avoids stacking two bottom bars)", () => {
    const source = read("src/app/(dashboard)/clients/[id]/portal-preview/page.tsx");
    expect(source).toContain("showNav={false}");
  });

  it("the public landing page does not depend on internal or portal navigation components", () => {
    const source = read("src/features/landing/landing-nav.tsx");
    expect(source).not.toContain("MobileBottomNav");
    expect(source).not.toContain("PortalMobileNav");
    expect(source).not.toContain("TabletNavDrawer");
  });

  it("the sign-in form does not depend on internal or portal navigation components", () => {
    const source = read("src/features/auth/sign-in-form.tsx");
    expect(source).not.toContain("MobileBottomNav");
    expect(source).not.toContain("PortalMobileNav");
  });
});
