import { requireWorkspace } from "@/lib/auth/session";
import { listCalendarFeed } from "@/server/queries/calendar";
import { listMembers } from "@/server/queries/members";
import { listClients } from "@/server/queries/clients";
import { todayInTimezone } from "@/lib/date-tz";
import { CalendarView } from "@/features/calendar/calendar-view";

export default async function CalendarPage() {
  const ctx = await requireWorkspace();
  const today = todayInTimezone(ctx.workspace.timezone);
  const [y, m] = today.split("-").map(Number);
  // Load a generous window; client navigates within it without refetching.
  const rangeStart = new Date(y, m - 2, 1);
  const rangeEnd = new Date(y, m + 1, 1);
  const [events, members, clients] = await Promise.all([
    listCalendarFeed(ctx.workspace.id, rangeStart, rangeEnd),
    listMembers(ctx.workspace.id),
    listClients(ctx.workspace.id),
  ]);
  return (
    <CalendarView
      events={events}
      members={members.map((m: { userId: string; name: string }) => ({ userId: m.userId, name: m.name }))}
      clients={clients.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))}
      today={today}
    />
  );
}
