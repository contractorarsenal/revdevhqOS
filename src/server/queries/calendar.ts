import "server-only";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarEvents, clients, profiles } from "@/lib/db/schema";

export async function listCalendarEvents(workspaceId: string, rangeStart: Date, rangeEnd: Date) {
  return db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      startAt: calendarEvents.startAt,
      endAt: calendarEvents.endAt,
      color: calendarEvents.color,
      notes: calendarEvents.notes,
      status: calendarEvents.status,
      clientId: calendarEvents.clientId,
      clientName: clients.name,
      taskId: calendarEvents.taskId,
      assigneeId: calendarEvents.assigneeId,
      assigneeName: profiles.name,
    })
    .from(calendarEvents)
    .leftJoin(clients, eq(calendarEvents.clientId, clients.id))
    .leftJoin(profiles, eq(calendarEvents.assigneeId, profiles.id))
    .where(and(
      eq(calendarEvents.workspaceId, workspaceId),
      gte(calendarEvents.startAt, rangeStart),
      lt(calendarEvents.startAt, rangeEnd)
    ))
    .orderBy(calendarEvents.startAt);
}

/** Today's events for the dashboard widget — small, targeted query. */
export async function listTodaySchedule(workspaceId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return listCalendarEvents(workspaceId, start, end);
}
