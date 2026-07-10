import { describe, expect, it } from "vitest";
import { resolveCalendarView, resolveTasksView } from "./view-defaults";

describe("resolveCalendarView — Calendar defaults to Day", () => {
  it("defaults to day with no URL param", () => {
    expect(resolveCalendarView(undefined)).toBe("day");
  });
  it("an explicit ?view=week overrides the default", () => {
    expect(resolveCalendarView("week")).toBe("week");
  });
  it("an explicit ?view=month overrides the default", () => {
    expect(resolveCalendarView("month")).toBe("month");
  });
  it("an unrecognized value falls back to day rather than erroring", () => {
    expect(resolveCalendarView("bogus")).toBe("day");
  });
});

describe("resolveTasksView — Tasks defaults to Board", () => {
  it("defaults to board with no URL param", () => {
    expect(resolveTasksView(undefined)).toBe("board");
  });
  it("an explicit ?view=list overrides the default", () => {
    expect(resolveTasksView("list")).toBe("list");
  });
  it("an explicit ?view=today overrides the default", () => {
    expect(resolveTasksView("today")).toBe("today");
  });
  it("an unrecognized value falls back to board rather than erroring", () => {
    expect(resolveTasksView("bogus")).toBe("board");
  });
});
