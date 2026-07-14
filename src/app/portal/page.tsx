import { requireClientPortalUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { clientLeadSummary } from "@/server/queries/client-leads";
import { todayInTimezone } from "@/lib/date-tz";
import { resolveClientAccent } from "@/lib/portal";
import { PortalShell } from "@/features/portal/portal-shell";
import { PortalOverview } from "@/features/portal/portal-overview";

export const metadata = { title: "Contractor Arsenal Command Center" };

export default async function PortalPage() {
  // Revalidates profile + ACTIVE membership + workspace/client server-side;
  // internal users are redirected back to /dashboard inside the guard.
  const ctx = await requireClientPortalUser();
  const accent = resolveClientAccent(ctx.client);
  const leadSummary = await clientLeadSummary(
    db,
    ctx.membership.workspaceId,
    ctx.membership.clientId,
    ctx.workspace.timezone,
    todayInTimezone(ctx.workspace.timezone)
  );

  return (
    <PortalShell businessName={ctx.client.name} accent={accent} userName={ctx.user.name}>
      <PortalOverview
        businessName={ctx.client.name}
        accent={accent}
        role={ctx.membership.role}
        status={ctx.membership.status}
        memberName={ctx.user.name}
        leadSummary={leadSummary}
      />
    </PortalShell>
  );
}
