import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { requireWorkspace } from "@/lib/auth/session";
import { listClientLeads } from "@/server/queries/client-leads";
import { ClientLeadsInternalView } from "@/features/clients/client-leads-internal-view";

export default async function ClientLeadsInternalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace();

  const [client] = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.workspaceId, ctx.workspace.id)))
    .limit(1);
  if (!client) notFound();

  const leads = await listClientLeads(db, ctx.workspace.id, id);

  return <ClientLeadsInternalView client={client} leads={leads} />;
}
