import { requireWorkspace } from "@/lib/auth/session";
import { listLeads } from "@/server/queries/leads";
import { listMembers } from "@/server/queries/members";
import { listClients } from "@/server/queries/clients";
import { LeadsView } from "@/features/leads/leads-view";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const ctx = await requireWorkspace();
  const [leads, members, clients] = await Promise.all([listLeads(ctx.workspace.id), listMembers(ctx.workspace.id), listClients(ctx.workspace.id)]);
  const params = await searchParams;
  return <LeadsView leads={leads} members={members} clients={clients.map((c) => ({ id: c.id, name: c.name }))} openNew={params.new === "1"} />;
}
