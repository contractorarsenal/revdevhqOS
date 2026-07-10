import { toDateOnlyString, formatInTimezone, zonedTimeToUtc } from "@/lib/date-tz";

/**
 * Pure calendar-feed merge logic, extracted from the query layer so the
 * required behaviors (scheduled task appears, unscheduled doesn't, no
 * duplicates, all-day handling, client-optional, correct local time) are
 * unit-testable without a database.
 *
 * Every feed item carries both a real `startAt`/`endAt` UTC instant (used
 * only for chronological sorting) AND precomputed `displayDate` /
 * `displayStartTime` / `displayEndTime` strings, already converted into the
 * workspace's timezone server-side. Consumers (Calendar grid, Dashboard,
 * edit dialogs) render the display fields directly and never re-derive a
 * time from a Date object themselves — that is what let the offset get
 * applied twice (once in storage, once implicitly by whatever timezone the
 * rendering environment happened to be in).
 */
export type FeedEventRow = {
  id: string; title: string; startAt: Date; endAt: Date; allDay: boolean;
  color: string | null; status: string; eventType: string;
  clientId: string | null; clientName: string | null;
  assigneeId: string | null; assigneeName: string | null; taskId: string | null;
};

export type FeedTaskRow = {
  id: string; title: string; status: string; priority: string;
  scheduledDate: string | Date | null; scheduledStartTime: string | null; scheduledEndTime: string | null;
  allDay: boolean; clientId: string | null; clientName: string | null;
  assigneeId: string | null; assigneeName: string | null; projectName: string | null;
  calendarVisible: boolean;
};

export type CalendarFeedItem = {
  id: string; kind: "event" | "task"; title: string; startAt: Date; endAt: Date; allDay: boolean;
  displayDate: string; displayStartTime: string; displayEndTime: string;
  color: string | null; status: string; eventType: string;
  clientId: string | null; clientName: string | null;
  assigneeId: string | null; assigneeName: string | null;
  taskId: string | null; projectName: string | null;
};

/** Normalizes scheduledDate (string or Date, depending on driver) once for reuse. */
function normalizedTask<T extends { scheduledDate: string | Date | null }>(t: T): T & { scheduledDate: string | null } {
  return { ...t, scheduledDate: toDateOnlyString(t.scheduledDate) };
}

/** A task belongs on the calendar only when it has a scheduled date and is calendar-visible. */
export function taskBelongsOnCalendar(task: Pick<FeedTaskRow, "scheduledDate" | "calendarVisible">): boolean {
  return Boolean(task.scheduledDate) && task.calendarVisible;
}

export function buildCalendarFeed(events: FeedEventRow[], rawTasks: FeedTaskRow[], timezone: string): CalendarFeedItem[] {
  const scheduledTasks = rawTasks.map(normalizedTask);

  const eventItems: CalendarFeedItem[] = events.map((e) => {
    const start = formatInTimezone(e.startAt, timezone);
    const end = formatInTimezone(e.endAt, timezone);
    return {
      id: e.id, kind: "event", title: e.title, startAt: e.startAt, endAt: e.endAt, allDay: e.allDay,
      displayDate: start.date, displayStartTime: start.time, displayEndTime: end.time,
      color: e.color, status: e.status, eventType: e.eventType, clientId: e.clientId, clientName: e.clientName,
      assigneeId: e.assigneeId, assigneeName: e.assigneeName, taskId: e.taskId, projectName: null,
    };
  });

  const taskItems: CalendarFeedItem[] = scheduledTasks
    .filter(taskBelongsOnCalendar)
    .map((t) => {
      // Tasks store workspace-local wall-clock parts directly (no stored UTC
      // instant) — those strings ARE the display value, used as-is. A
      // synthetic startAt/endAt is derived only so this item can be sorted
      // chronologically alongside real timestamptz events.
      const displayStartTime = t.allDay ? "00:00" : (t.scheduledStartTime ?? "00:00");
      const displayEndTime = t.allDay ? "23:59" : (t.scheduledEndTime ?? t.scheduledStartTime ?? "00:00");
      const startAt = zonedTimeToUtc(t.scheduledDate!, displayStartTime, timezone);
      const endAt = zonedTimeToUtc(t.scheduledDate!, displayEndTime, timezone);
      return {
        id: t.id, kind: "task" as const, title: t.title, startAt, endAt, allDay: t.allDay,
        displayDate: t.scheduledDate!, displayStartTime, displayEndTime,
        color: t.status === "completed" ? "#64748B" : "#0D9488", status: t.status, eventType: "task",
        clientId: t.clientId, clientName: t.clientName, assigneeId: t.assigneeId, assigneeName: t.assigneeName,
        taskId: t.id, projectName: t.projectName,
      };
    });

  return [...eventItems, ...taskItems].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/** Project progress as a rounded percentage; 0 for a project with no tasks. */
export function calculateProjectProgress(totalTasks: number, completedTasks: number): number {
  if (totalTasks <= 0) return 0;
  return Math.round((completedTasks / totalTasks) * 100);
}

export type MyDayTask = {
  id: string; status: string; dueDate: Date | string | null;
  scheduledDate: string | Date | null;
};

/** Splits tasks into My Day buckets: scheduled today, due today, overdue — each task appears once. */
export function buildMyDay<T extends MyDayTask>(tasks: T[], today: string): { scheduledToday: T[]; dueToday: T[]; overdue: T[] } {
  const isOpen = (t: T) => t.status !== "completed" && t.status !== "canceled";
  const dueDateStr = (t: T) => toDateOnlyString(t.dueDate);
  const schedDateStr = (t: T) => toDateOnlyString(t.scheduledDate);

  const scheduledToday = tasks.filter((t) => isOpen(t) && schedDateStr(t) === today);
  const scheduledIds = new Set(scheduledToday.map((t) => t.id));
  const dueToday = tasks.filter((t) => isOpen(t) && dueDateStr(t) === today && !scheduledIds.has(t.id));
  const overdue = tasks.filter((t) => {
    const d = dueDateStr(t);
    return isOpen(t) && d !== null && d < today && !scheduledIds.has(t.id);
  });
  return { scheduledToday, dueToday, overdue };
}
