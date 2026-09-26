import { describe, expect, it } from "vitest";
import { normalizeLayout, DEFAULT_DASHBOARD_ORDER } from "./dashboard-layout";
import { attentionReasons, classifyWaitingOn } from "./project-ops";
import { buildStoragePath, isAllowedMime, isPathInScope, sanitizeFileName } from "./client-files";
import { monthOf, softDuplicateKey, sumRows } from "./bulk-payments";

describe("normalizeLayout", () => {
  it("returns defaults for junk", () => {
    expect(normalizeLayout(null).order).toEqual(DEFAULT_DASHBOARD_ORDER);
    expect(normalizeLayout("x").hidden).toEqual([]);
  });
  it("drops unknown/duplicate ids and appends new widgets", () => {
    const l = normalizeLayout({ order: ["activity", "activity", "bogus", "needs_jay"], hidden: ["financial", "nope"] });
    expect(l.order.slice(0, 2)).toEqual(["activity", "needs_jay"]);
    expect(new Set(l.order).size).toBe(DEFAULT_DASHBOARD_ORDER.length);
    expect(l.hidden).toEqual(["financial"]);
  });
});

describe("classifyWaitingOn", () => {
  it("explicit party wins", () => {
    expect(classifyWaitingOn({ status: "building", waitingOn: "client photos", waitingOnParty: "jay" })).toBe("jay");
  });
  it("stage and keywords fall back", () => {
    expect(classifyWaitingOn({ status: "waiting_on_client", waitingOn: null, waitingOnParty: null })).toBe("client");
    expect(classifyWaitingOn({ status: "building", waitingOn: "GoDaddy DNS", waitingOnParty: null })).toBe("third_party");
    expect(classifyWaitingOn({ status: "building", waitingOn: null, waitingOnParty: null })).toBeNull();
  });
});

describe("attentionReasons", () => {
  const base = { id: "1", name: "P", status: "building", dueDate: null, waitingOn: null, updatedAt: new Date("2026-06-01"), overdueTaskCount: 0 };
  const now = new Date("2026-06-10T12:00:00Z");
  it("is empty for a healthy project and for live/closed", () => {
    expect(attentionReasons(base, "2026-06-10", now)).toEqual([]);
    expect(attentionReasons({ ...base, status: "live", overdueTaskCount: 3 }, "2026-06-10", now)).toEqual([]);
  });
  it("names each rule that fires", () => {
    const r = attentionReasons({ ...base, status: "at_risk", overdueTaskCount: 2, dueDate: "2026-06-05", waitingOn: "x" }, "2026-06-10", now);
    expect(r).toEqual(expect.arrayContaining(["Marked At Risk", "2 overdue tasks", "Target date passed 5d ago", "Waiting 9d with no update"]));
  });
  it("flags approaching target", () => {
    expect(attentionReasons({ ...base, dueDate: "2026-06-13" }, "2026-06-10", now)).toContain("Due in 3d");
  });
});

describe("client-files helpers", () => {
  it("sanitizes names and paths", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(buildStoragePath("w", "c", "u", "a/b.pdf")).toBe("w/c/u-b.pdf");
  });
  it("scopes paths", () => {
    expect(isPathInScope("w/c/x", "w", "c")).toBe(true);
    expect(isPathInScope("w/other/x", "w", "c")).toBe(false);
    expect(isPathInScope("w/c/../other/x", "w", "c")).toBe(false);
  });
  it("mime allowlist", () => {
    expect(isAllowedMime("application/pdf")).toBe(true);
    expect(isAllowedMime("text/html")).toBe(false);
    expect(isAllowedMime(null)).toBe(false);
  });
});

describe("bulk-payments helpers", () => {
  it("month, key and sum", () => {
    expect(monthOf("2026-06-15")).toBe("2026-06");
    expect(softDuplicateKey({ clientId: "c", amount: 10, paidAt: "2026-06-15" })).toBe(softDuplicateKey({ clientId: "c", amount: 10, paidAt: "2026-06-15" }));
    expect(sumRows([{ amount: 0.1 }, { amount: 0.2 }])).toBeCloseTo(0.3, 2);
  });
});
