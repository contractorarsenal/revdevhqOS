import { requireWorkspace } from "@/lib/auth/session";
import { listCalendarEvents } from "@/server/queries/calendar";
import { listMembers } from "@/server/queries/members";
import { listClients } from "@/server/queries/clients";
import { CalendarView } from "@/features/calendar/calendar-view";

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday start
  const s = new Date(d);
  s.setDate(d.getDate() + diff);
  s.setHours(0, 0, 0, 0);
  return s;
}

export default async function CalendarPage() {
  const ctx = await requireWorkspace();
  // Load a generous month-wide window client-side navigates within;
  // month view needs the full month, week/day are subsets of it.
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const [events, members, clients] = await Promise.all([
    listCalendarEvents(ctx.workspace.id, rangeStart, rangeEnd),
    listMembers(ctx.workspace.id),
    listClients(ctx.workspace.id),
  ]);
  return (
    <CalendarView
      events={events}
      members={members.map((m) => ({ userId: m.userId, name: m.name }))}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      initialWeekStart={startOfWeek(now).toISOString()}
    />
  );
}
