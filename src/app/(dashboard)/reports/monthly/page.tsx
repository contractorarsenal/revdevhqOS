import { requireWorkspace } from "@/lib/auth/session";
import { getMonthlyReport, listReportableMonths } from "@/server/queries/monthly-report";
import { MonthlyReportView } from "@/features/reports/monthly-report-view";

// Date-sensitive (current month defaults, live goal math) — never statically
// frozen. Internal-only: requireWorkspace() redirects any user without an
// internal workspace membership (including client-portal-only users) away
// from this page before any report data is queried — see
// resolvePostLoginDestination in lib/portal.ts (portal.test.ts) for the
// authoritative, already-tested redirect matrix this relies on.
export const dynamic = "force-dynamic";

export default async function MonthlyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const ctx = await requireWorkspace();
  const { month } = await searchParams;

  const months = await listReportableMonths(ctx.workspace.timezone);
  const match = month ? months.find((m) => m.value === month) : undefined;
  const offset = match?.offset ?? 0;
  const selectedValue = match?.value ?? months[0]?.value ?? "";

  const report = await getMonthlyReport(ctx.workspace.id, ctx.workspace.timezone, offset);

  return <MonthlyReportView report={report} months={months} selectedValue={selectedValue} />;
}
