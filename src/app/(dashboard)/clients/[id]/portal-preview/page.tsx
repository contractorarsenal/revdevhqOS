import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/session";
import { canAdminister } from "@/lib/permissions";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { getClientLeadMetrics } from "@/server/queries/client-leads";
import { getClientPortalAccess } from "@/server/queries/client-portal";
import { todayInTimezone } from "@/lib/date-tz";
import { resolveClientAccent } from "@/lib/portal";
import { PortalShell } from "@/features/portal/portal-shell";
import { PortalOverview } from "@/features/portal/portal-overview";

export const metadata = { title: "Client portal preview" };
// Date-sensitive (lead metrics) — never statically frozen.
export const dynamic = "force-dynamic";

/**
 * Internal-only, read-only preview of what a client would see. Server-
 * authorized on every request (owner/admin), scoped to the caller's
 * workspace, and rendered from the same presentational components as the
 * real portal — no session change, no membership row, no impersonation.
 */
export default async function PortalPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace();
  if (!canAdminister(ctx.role)) redirect(`/clients/${id}`);

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.workspaceId, ctx.workspace.id)))
    .limit(1);
  if (!client) notFound();

  const accent = resolveClientAccent(client);
  const [leadMetrics, access] = await Promise.all([
    getClientLeadMetrics(db, ctx.workspace.id, client.id, ctx.workspace.timezone, todayInTimezone(ctx.workspace.timezone)),
    getClientPortalAccess(ctx.workspace.id, client.id),
  ]);

  const previewName = access.primaryContact?.name ?? "Client";

  return (
    <div>
      <div className="sticky top-0 z-50 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-300 bg-amber-50 px-4 py-2 text-[12.5px] font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <span className="min-w-0 flex-1 truncate">
          Previewing client portal as {client.name} — read-only
        </span>
        <Link
          href={`/clients/${client.id}`}
          className="shrink-0 rounded-sm font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Exit Preview
        </Link>
      </div>
      <PortalShell businessName={client.name} accent={accent} showSignOut={false} showNav={false}>
        <PortalOverview
          businessName={client.name}
          accent={accent}
          role={access.membership?.role ?? "client_owner"}
          status={access.membership?.status ?? "active"}
          memberName={previewName}
          leadMetrics={leadMetrics}
        />
      </PortalShell>
    </div>
  );
}
