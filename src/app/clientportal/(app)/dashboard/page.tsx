import { db } from "@/lib/db";
import { authorizePortal } from "@/server/portal-authorize";
import { getPortalDashboard } from "@/server/queries/portal-data";
import { getClientLeadMetrics } from "@/server/queries/client-leads";
import { todayInTimezone } from "@/lib/date-tz";
import { PortalDashboardView } from "@/features/clientportal/dashboard-view";

export default async function ClientPortalDashboardPage() {
  const ctx = await authorizePortal("client_read_only");
  const scope = { workspaceId: ctx.membership.workspaceId, clientId: ctx.membership.clientId };
  const today = todayInTimezone(ctx.workspace.timezone);
  const [data, leadMetrics] = await Promise.all([
    getPortalDashboard(db, scope, today, ctx.user.id),
    getClientLeadMetrics(db, scope.workspaceId, scope.clientId, ctx.workspace.timezone, today),
  ]);
  return <PortalDashboardView firstName={ctx.user.name.split(" ")[0]} data={data} leadMetrics={leadMetrics} />;
}
