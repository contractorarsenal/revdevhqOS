import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("portal never trusts a browser-supplied client scope", () => {
  const pages = walk("src/app/clientportal").filter((f) => f.endsWith("page.tsx") || f.endsWith("layout.tsx"));

  it("no portal page reads clientId/workspaceId from params or searchParams", () => {
    for (const f of pages) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/searchParams[^;]*clientId/);
      expect(src, f).not.toMatch(/params[^;]*(clientId|workspaceId)/);
    }
  });

  it("authenticated portal pages derive scope from the membership", () => {
    const layout = readFileSync("src/app/clientportal/(app)/layout.tsx", "utf8");
    expect(layout).toContain("requireClientPortalUser");
  });

  it("portal action/query schemas do not accept clientId, role or workspaceId", () => {
    const v = readFileSync("src/lib/validation/index.ts", "utf8");
    for (const name of ["portalAccountSchema", "portalRequestWithProjectSchema", "requestUploadSchema"]) {
      const start = v.indexOf(`export const ${name}`);
      expect(start, name).toBeGreaterThan(-1);
      const block = v.slice(start, v.indexOf("\n});", start));
      expect(block, name).not.toMatch(/clientId|workspaceId|role|permissions/);
    }
  });

  it("legacy /portal routes redirect to /clientportal", () => {
    const cfg = readFileSync("next.config.ts", "utf8");
    for (const p of ["/portal", "/portal/leads", "/portal/requests", "/portal/accept-invite", "/portal/access-denied"]) {
      expect(cfg).toContain(`"${p}"`);
    }
  });
});
