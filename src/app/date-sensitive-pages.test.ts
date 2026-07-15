/**
 * Guard: every page that renders date-derived numbers (days remaining,
 * pace, due states, "this month" totals) must opt out of static/ISR
 * rendering, because those values change at every workspace-local midnight
 * even when no mutation fires a revalidation. Mutation-driven
 * revalidatePath alone cannot keep a frozen page honest across midnight.
 *
 * The runtime behavior (numbers moving with the clock) is covered by the
 * fake-timer tests in period-stats.integration.test.ts; this test pins the
 * rendering mode so a future refactor can't silently reintroduce a cached
 * page.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DATE_SENSITIVE_PAGES = [
  "src/app/(dashboard)/dashboard/page.tsx",
  "src/app/(dashboard)/goals/page.tsx",
  "src/app/(dashboard)/goals/[id]/page.tsx",
  "src/app/(dashboard)/billing/page.tsx",
  "src/app/(dashboard)/reports/page.tsx",
  "src/app/(dashboard)/reports/monthly/page.tsx",
  "src/app/(dashboard)/clients/[id]/page.tsx",
];

describe("date-sensitive pages are always rendered at request time", () => {
  for (const page of DATE_SENSITIVE_PAGES) {
    it(`${page} exports dynamic = "force-dynamic"`, () => {
      const source = readFileSync(join(process.cwd(), page), "utf8");
      expect(source).toMatch(/export const dynamic = "force-dynamic"/);
    });
  }
});
