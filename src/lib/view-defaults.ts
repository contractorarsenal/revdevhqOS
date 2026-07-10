export type CalendarViewMode = "day" | "week" | "month";
export type TasksViewMode = "list" | "board" | "today";

/** Calendar defaults to Day; an explicit ?view= param may override it. */
export function resolveCalendarView(param: string | undefined): CalendarViewMode {
  return param === "week" || param === "month" ? param : "day";
}

/** Tasks defaults to Board; an explicit ?view= param may override it. */
export function resolveTasksView(param: string | undefined): TasksViewMode {
  return param === "list" || param === "today" ? param : "board";
}
