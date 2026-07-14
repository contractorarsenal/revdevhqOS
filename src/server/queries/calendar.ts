import "server-only";
import { and, eq, gte, lt, lte, ne, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessGoals, calendarEvents, clients, profiles, tasks, projects } from "@/lib/db/schema";
import { buildCalendarFeed, type CalendarFeedItem, type FeedGoalRow } from "@/lib/calendar-feed";
import { formatInTimezone } from "@/lib/date-tz";
import type { GoalPeriodType } from "@/lib/goals";

export type { CalendarFeedItem };

/**
 * Unified calendar feed: standalone calendar_events plus tasks that carry
 * scheduling info, normalized into one shape by the pure buildCalendarFeed
 * (unit-tested). Scheduled tasks are read directly from `tasks` — no
 * calendar_events row is created for them, so there is exactly one record
 * per scheduled task, never a duplicate.
 */
export async function listCalendarFeed(
  workspaceId: string,
  rangeStart: Date,
  rangeEnd: Date,
  timezone: string,
  options: { includeGoals?: boolean } = {}
): Promise<CalendarFeedItem[]> {
  // Goals appear on the Calendar only — Today's Schedule and other "what am
  // I doing today" widgets pass includeGoals: false.
  const includeGoals = options.includeGoals ?? true;
  // Task scheduledDate is a plain workspace-local date (no timezone of its
  // own) — bound it against the *workspace-local* calendar dates of the
  // range, not the UTC calendar date of the range instants (which can be a
  // different day depending on the offset's sign).
  const rangeStartLocalDate = formatInTimezone(rangeStart, timezone).date;
  const rangeEndLocalDate = formatInTimezone(rangeEnd, timezone).date;
  const [events, scheduledTasks, goalRows] = await Promise.all([
    db
      .select({
        id: calendarEvents.id, title: calendarEvents.title, startAt: calendarEvents.startAt, endAt: calendarEvents.endAt,
        allDay: calendarEvents.allDay, color: calendarEvents.color, status: calendarEvents.status, eventType: calendarEvents.eventType,
        clientId: calendarEvents.clientId, clientName: clients.name, assigneeId: calendarEvents.assigneeId, assigneeName: profiles.name,
        taskId: calendarEvents.taskId,
      })
      .from(calendarEvents)
      .leftJoin(clients, eq(calendarEvents.clientId, clients.id))
      .leftJoin(profiles, eq(calendarEvents.assigneeId, profiles.id))
      .where(and(eq(calendarEvents.workspaceId, workspaceId), gte(calendarEvents.startAt, rangeStart), lt(calendarEvents.startAt, rangeEnd))),
    db
      .select({
        id: tasks.id, title: tasks.title, status: tasks.status, priority: tasks.priority,
        scheduledDate: tasks.scheduledDate, scheduledStartTime: tasks.scheduledStartTime, scheduledEndTime: tasks.scheduledEndTime,
        allDay: tasks.allDay, calendarVisible: tasks.calendarVisible, clientId: tasks.clientId, clientName: clients.name,
        assigneeId: tasks.assigneeId, assigneeName: profiles.name, projectName: projects.name,
      })
      .from(tasks)
      .leftJoin(clients, eq(tasks.clientId, clients.id))
      .leftJoin(profiles, eq(tasks.assigneeId, profiles.id))
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.calendarVisible, true),
        isNotNull(tasks.scheduledDate),
        gte(tasks.scheduledDate, rangeStartLocalDate),
        lt(tasks.scheduledDate, rangeEndLocalDate)
      )),
    includeGoals
      ? db
          .select({
            id: businessGoals.id, name: businessGoals.name, periodType: businessGoals.periodType,
            periodStart: businessGoals.periodStart, periodEnd: businessGoals.periodEnd,
            status: businessGoals.status, color: businessGoals.color,
          })
          .from(businessGoals)
          .where(and(
            eq(businessGoals.workspaceId, workspaceId),
            ne(businessGoals.status, "archived"),
            // Any goal whose period overlaps the visible range contributes
            // its start/deadline milestones (each rendered only on its day).
            lte(businessGoals.periodStart, rangeEndLocalDate),
            gte(businessGoals.periodEnd, rangeStartLocalDate)
          ))
      : Promise.resolve([]),
  ]);

  const goals: FeedGoalRow[] = goalRows.map((g) => ({
    ...g,
    periodType: g.periodType as GoalPeriodType,
  }));
  return buildCalendarFeed(events, scheduledTasks, goals, timezone);
}

/** Today's items for dashboard / My Day widgets — small, targeted query.
 * Goal milestones are Calendar-only, so they are excluded here. */
export async function listTodayFeed(workspaceId: string, start: Date, end: Date, timezone: string) {
  return listCalendarFeed(workspaceId, start, end, timezone, { includeGoals: false });
}
