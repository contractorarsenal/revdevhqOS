import { describe, expect, it } from "vitest";
import { buildCalendarFeed, calculateProjectProgress, buildMyDay, type FeedEventRow, type FeedTaskRow } from "./calendar-feed";

function event(overrides: Partial<FeedEventRow> = {}): FeedEventRow {
  return {
    id: "e1", title: "Team meeting", startAt: new Date("2026-07-09T16:00:00Z"), endAt: new Date("2026-07-09T17:00:00Z"),
    allDay: false, color: "#4F46E5", status: "scheduled", eventType: "meeting",
    clientId: null, clientName: null, assigneeId: null, assigneeName: null, taskId: null,
    ...overrides,
  };
}
function task(overrides: Partial<FeedTaskRow> = {}): FeedTaskRow {
  return {
    id: "t1", title: "Finish homepage revisions", status: "todo", priority: "medium",
    scheduledDate: "2026-07-09", scheduledStartTime: "14:00", scheduledEndTime: "16:00", allDay: false,
    clientId: null, clientName: null, assigneeId: null, assigneeName: null, projectName: "Contractor Arsenal website",
    calendarVisible: true,
    ...overrides,
  };
}

describe("buildCalendarFeed", () => {
  it("a standalone event works without a client (client is optional)", () => {
    const feed = buildCalendarFeed([event({ clientId: null, clientName: null })], []);
    expect(feed).toHaveLength(1);
    expect(feed[0].clientId).toBeNull();
  });

  it("a scheduled task with date+time appears in the feed at the right time", () => {
    const feed = buildCalendarFeed([], [task()]);
    expect(feed).toHaveLength(1);
    expect(feed[0].kind).toBe("task");
    expect(feed[0].startAt.getHours()).toBe(14);
    expect(feed[0].startAt.getDate()).toBe(9);
  });

  it("a scheduled task with no time is all-day and spans the whole day", () => {
    const feed = buildCalendarFeed([], [task({ allDay: true, scheduledStartTime: null, scheduledEndTime: null })]);
    expect(feed[0].allDay).toBe(true);
    expect(feed[0].endAt.getHours()).toBe(23);
  });

  it("an unscheduled task (no scheduledDate) does not appear on the calendar", () => {
    const feed = buildCalendarFeed([], [task({ scheduledDate: null })]);
    expect(feed).toHaveLength(0);
  });

  it("a task hidden from the calendar (calendarVisible=false) does not appear even if scheduled", () => {
    const feed = buildCalendarFeed([], [task({ calendarVisible: false })]);
    expect(feed).toHaveLength(0);
  });

  it("a completed task is represented with a distinct (muted) color and status", () => {
    const feed = buildCalendarFeed([], [task({ status: "completed" })]);
    expect(feed[0].status).toBe("completed");
    expect(feed[0].color).not.toBe("#0D9488");
  });

  it("exactly one feed item exists per scheduled task — never a duplicate", () => {
    const feed = buildCalendarFeed([], [task(), task({ id: "t2", scheduledDate: "2026-07-10" })]);
    const ids = feed.filter((f) => f.kind === "task").map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(2);
  });

  it("standalone events and scheduled tasks merge into one chronologically sorted feed", () => {
    // task at local 14:00 on 07-09; event pinned well after it the same day, regardless of the test runner's own timezone
    const taskStart = new Date("2026-07-09T14:00:00");
    const feed = buildCalendarFeed(
      [event({ id: "e1", startAt: new Date(taskStart.getTime() + 4 * 3600 * 1000), endAt: new Date(taskStart.getTime() + 5 * 3600 * 1000) })],
      [task({ id: "t1" })]
    );
    expect(feed.map((f) => f.id)).toEqual(["t1", "e1"]);
  });
});

describe("calculateProjectProgress", () => {
  it("is 0% for a project with no tasks", () => {
    expect(calculateProjectProgress(0, 0)).toBe(0);
  });
  it("rounds to the nearest percent", () => {
    expect(calculateProjectProgress(3, 1)).toBe(33);
  });
  it("is 100% when every task is completed", () => {
    expect(calculateProjectProgress(4, 4)).toBe(100);
  });
});

describe("buildMyDay", () => {
  const today = "2026-07-09";
  it("includes a task scheduled today", () => {
    const { scheduledToday } = buildMyDay([{ id: "1", status: "todo", dueDate: null, scheduledDate: today }], today);
    expect(scheduledToday).toHaveLength(1);
  });
  it("includes a task due today that isn't separately scheduled", () => {
    const { dueToday } = buildMyDay([{ id: "1", status: "todo", dueDate: new Date(today + "T12:00:00"), scheduledDate: null }], today);
    expect(dueToday).toHaveLength(1);
  });
  it("includes an overdue incomplete task", () => {
    const { overdue } = buildMyDay([{ id: "1", status: "todo", dueDate: new Date("2026-07-01T12:00:00"), scheduledDate: null }], today);
    expect(overdue).toHaveLength(1);
  });
  it("excludes completed tasks from every bucket", () => {
    const result = buildMyDay([{ id: "1", status: "completed", dueDate: new Date("2026-07-01T12:00:00"), scheduledDate: today }], today);
    expect(result.scheduledToday).toHaveLength(0);
    expect(result.overdue).toHaveLength(0);
  });
  it("does not double-count a task that is both scheduled and due today", () => {
    const result = buildMyDay([{ id: "1", status: "todo", dueDate: new Date(today + "T12:00:00"), scheduledDate: today }], today);
    expect(result.scheduledToday).toHaveLength(1);
    expect(result.dueToday).toHaveLength(0);
  });
});

describe("driver-inconsistent date types (regression: PGlite returns Date, Postgres returns string)", () => {
  it("buildCalendarFeed handles a scheduledDate returned as a Date object", () => {
    const feed = buildCalendarFeed([], [task({ scheduledDate: new Date("2026-07-09T00:00:00.000Z") as unknown as string })]);
    expect(feed).toHaveLength(1);
  });

  it("buildMyDay matches a Date-object scheduledDate against a plain today string", () => {
    const { scheduledToday } = buildMyDay(
      [{ id: "1", status: "todo", dueDate: null, scheduledDate: new Date("2026-07-09T00:00:00.000Z") }],
      "2026-07-09"
    );
    expect(scheduledToday).toHaveLength(1);
  });

  it("buildMyDay matches a Date-object dueDate against a plain today string", () => {
    const { dueToday } = buildMyDay(
      [{ id: "1", status: "todo", dueDate: new Date("2026-07-09T00:00:00.000Z"), scheduledDate: null }],
      "2026-07-09"
    );
    expect(dueToday).toHaveLength(1);
  });
});
