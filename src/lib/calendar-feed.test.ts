import { describe, expect, it } from "vitest";
import { buildCalendarFeed, calculateProjectProgress, buildMyDay, type FeedEventRow, type FeedTaskRow, type FeedGoalRow } from "./calendar-feed";
import { zonedTimeToUtc } from "./date-tz";

const TZ = "America/Los_Angeles";

function event(overrides: Partial<FeedEventRow> = {}): FeedEventRow {
  return {
    id: "e1", title: "Team meeting",
    startAt: zonedTimeToUtc("2026-07-09", "16:00", TZ), endAt: zonedTimeToUtc("2026-07-09", "17:00", TZ),
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
    const feed = buildCalendarFeed([event({ clientId: null, clientName: null })], [], [], TZ);
    expect(feed).toHaveLength(1);
    expect(feed[0].clientId).toBeNull();
  });

  it("a scheduled task with date+time appears in the feed with the exact display time entered", () => {
    const feed = buildCalendarFeed([], [task()], [], TZ);
    expect(feed).toHaveLength(1);
    expect(feed[0].kind).toBe("task");
    expect(feed[0].displayDate).toBe("2026-07-09");
    expect(feed[0].displayStartTime).toBe("14:00");
    expect(feed[0].displayEndTime).toBe("16:00");
  });

  it("a scheduled task with no time is all-day and spans the whole day", () => {
    const feed = buildCalendarFeed([], [task({ allDay: true, scheduledStartTime: null, scheduledEndTime: null })], [], TZ);
    expect(feed[0].allDay).toBe(true);
    expect(feed[0].displayStartTime).toBe("00:00");
    expect(feed[0].displayEndTime).toBe("23:59");
  });

  it("an unscheduled task (no scheduledDate) does not appear on the calendar", () => {
    const feed = buildCalendarFeed([], [task({ scheduledDate: null })], [], TZ);
    expect(feed).toHaveLength(0);
  });

  it("a task hidden from the calendar (calendarVisible=false) does not appear even if scheduled", () => {
    const feed = buildCalendarFeed([], [task({ calendarVisible: false })], [], TZ);
    expect(feed).toHaveLength(0);
  });

  it("a completed task is represented with a distinct (muted) color and status", () => {
    const feed = buildCalendarFeed([], [task({ status: "completed" })], [], TZ);
    expect(feed[0].status).toBe("completed");
    expect(feed[0].color).not.toBe("#0D9488");
  });

  it("exactly one feed item exists per scheduled task — never a duplicate", () => {
    const feed = buildCalendarFeed([], [task(), task({ id: "t2", scheduledDate: "2026-07-10" })], [], TZ);
    const ids = feed.filter((f) => f.kind === "task").map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(2);
  });

  it("standalone events and scheduled tasks merge into one chronologically sorted feed", () => {
    const feed = buildCalendarFeed([event({ id: "e1", startAt: zonedTimeToUtc("2026-07-09", "18:00", TZ), endAt: zonedTimeToUtc("2026-07-09", "19:00", TZ) })],
      [task({ id: "t1" })],
      [],
      TZ
    );
    expect(feed.map((f) => f.id)).toEqual(["t1", "e1"]);
  });

  describe("the calendar time bug — 3:00 PM to 4:00 PM must never become 8:00 AM", () => {
    it("an event entered as 3:00 PM-4:00 PM Pacific displays as 3:00 PM-4:00 PM, not 8:00 AM-9:00 AM", () => {
      const feed = buildCalendarFeed([event({ startAt: zonedTimeToUtc("2026-07-10", "15:00", TZ), endAt: zonedTimeToUtc("2026-07-10", "16:00", TZ) })],
        [],
        [],
        TZ
      );
      expect(feed[0].displayStartTime).toBe("15:00");
      expect(feed[0].displayEndTime).toBe("16:00");
      expect(feed[0].displayDate).toBe("2026-07-10");
    });

    it("editing to 5:00 PM-6:00 PM produces the new display time, not the old one", () => {
      const feed = buildCalendarFeed([event({ startAt: zonedTimeToUtc("2026-07-10", "17:00", TZ), endAt: zonedTimeToUtc("2026-07-10", "18:00", TZ) })],
        [],
        [],
        TZ
      );
      expect(feed[0].displayStartTime).toBe("17:00");
      expect(feed[0].displayEndTime).toBe("18:00");
    });

    it("a scheduled task's displayed time matches what was entered, independent of server timezone", () => {
      const feed = buildCalendarFeed([], [task({ scheduledStartTime: "15:00", scheduledEndTime: "16:00" })], [], TZ);
      expect(feed[0].displayStartTime).toBe("15:00");
      expect(feed[0].displayEndTime).toBe("16:00");
    });
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
    const feed = buildCalendarFeed([], [task({ scheduledDate: new Date("2026-07-09T00:00:00.000Z") as unknown as string })], [], TZ);
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

describe("goal milestones on the calendar", () => {
  function goal(overrides: Partial<FeedGoalRow> = {}): FeedGoalRow {
    return {
      id: "g1", name: "Monthly Revenue", periodType: "monthly",
      periodStart: "2026-07-01", periodEnd: "2026-07-31",
      status: "active", color: null,
      ...overrides,
    };
  }

  it("a goal produces exactly one start and one deadline milestone", () => {
    const feed = buildCalendarFeed([], [], [goal()], TZ);
    expect(feed).toHaveLength(2);
    const start = feed.find((f) => f.id === "g1:start");
    const deadline = feed.find((f) => f.id === "g1:deadline");
    expect(start?.title).toBe("Goal starts: Monthly Revenue — July 2026");
    expect(start?.displayDate).toBe("2026-07-01");
    expect(deadline?.title).toBe("Goal deadline: Monthly Revenue — July 2026");
    expect(deadline?.displayDate).toBe("2026-07-31");
  });

  it("milestones are all-day, carry the goal link, and never duplicate on rebuild", () => {
    const feed1 = buildCalendarFeed([], [], [goal()], TZ);
    const feed2 = buildCalendarFeed([], [], [goal()], TZ);
    expect(feed1.every((f) => f.allDay && f.kind === "goal" && f.goalId === "g1")).toBe(true);
    // Rebuilding from the same source rows (a refresh) yields identical ids —
    // derived items can never accumulate.
    expect(feed2.map((f) => f.id)).toEqual(feed1.map((f) => f.id));
    expect(new Set(feed1.map((f) => f.id)).size).toBe(feed1.length);
  });

  it("a same-day period produces one combined milestone", () => {
    const feed = buildCalendarFeed([], [], [goal({ periodType: "custom", periodStart: "2026-07-15", periodEnd: "2026-07-15" })], TZ);
    expect(feed).toHaveLength(1);
    expect(feed[0].id).toBe("g1:milestone");
    expect(feed[0].title).toContain("Goal: Monthly Revenue");
  });

  it("archived goals produce no milestones", () => {
    const feed = buildCalendarFeed([], [], [goal({ status: "archived" })], TZ);
    expect(feed).toHaveLength(0);
  });

  it("goal milestones merge and sort with events and tasks", () => {
    const feed = buildCalendarFeed(
      [event({ startAt: zonedTimeToUtc("2026-07-01", "09:00", TZ), endAt: zonedTimeToUtc("2026-07-01", "10:00", TZ) })],
      [],
      [goal()],
      TZ
    );
    // start milestone (00:00) sorts before the 9 AM event on the same day
    expect(feed[0].id).toBe("g1:start");
    expect(feed[1].kind).toBe("event");
  });

  it("events and tasks carry goalId: null so only milestones link to goals", () => {
    const feed = buildCalendarFeed([event()], [task()], [], TZ);
    expect(feed.every((f) => f.goalId === null)).toBe(true);
  });
});
