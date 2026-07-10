import { requireWorkspace } from "@/lib/auth/session";
import { listCalendarFeed } from "@/server/queries/calendar";
import { listMembers } from "@/server/queries/members";
import { listClients } from "@/server/queries/clients";
import { todayInTimezone } from "@/lib/date-tz";
import { resolveCalendarView } from "@/lib/view-defaults";
import { CalendarView } from "@/features/calendar/calendar-view";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; event?: string }>;
}) {
  const ctx = await requireWorkspace();
  const today = todayInTimezone(ctx.workspace.timezone);
  const params = await searchParams;
  const initialView = resolveCalendarView(params.view);
  const initialDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;

  const [y, m] = today.split("-").map(Number);
  // Load a generous window (UTC-constructed so it is independent of the
  // server process's own timezone); client navigates within it without refetching.
  const rangeStart = new Date(Date.UTC(y, m - 2, 1));
  const rangeEnd = new Date(Date.UTC(y, m + 1, 1));
  const [events, members, clients] = await Promise.all([
    listCalendarFeed(ctx.workspace.id, rangeStart, rangeEnd, ctx.workspace.timezone),
    listMembers(ctx.workspace.id),
    listClients(ctx.workspace.id),
  ]);
  return (
    <CalendarView
      events={events}
      members={members.map((m: { userId: string; name: string }) => ({ userId: m.userId, name: m.name }))}
      clients={clients.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))}
      today={today}
      initialView={initialView}
      initialDate={initialDate}
      openEventId={params.event}
    />
  );
}
