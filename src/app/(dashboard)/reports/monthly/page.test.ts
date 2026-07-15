/**
 * Guard: Monthly Reports is internal-only. The page must gate on
 * requireWorkspace() — the same authoritative check every other internal
 * page uses — rather than inventing a second auth mechanism. Portal-only
 * users have no workspaceMembers row, so requireWorkspace() redirects them
 * via resolvePostLoginDestination() to /portal or /portal/access-denied,
 * never past this point; that redirect matrix is exhaustively tested in
 * src/lib/portal.test.ts (hasInternalMembership: false never resolves to an
 * internal route). This test only pins that the page actually calls the
 * shared gate, structurally, so a future refactor can't accidentally drop it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("/reports/monthly is internal-only", () => {
  it("calls requireWorkspace() as its entry gate", () => {
    const source = readFileSync(join(process.cwd(), "src/app/(dashboard)/reports/monthly/page.tsx"), "utf8");
    expect(source).toMatch(/requireWorkspace\(\)/);
    expect(source).toMatch(/from "@\/lib\/auth\/session"/);
  });
});
