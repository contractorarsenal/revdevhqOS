import { requireWorkspace } from "@/lib/auth/session";
import { listClients } from "@/server/queries/clients";
import { listMembers } from "@/server/queries/members";
import { ClientsView } from "@/features/clients/clients-view";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const ctx = await requireWorkspace();
  const [clients, members] = await Promise.all([
    listClients(ctx.workspace.id),
    listMembers(ctx.workspace.id),
  ]);
  const params = await searchParams;
  return <ClientsView clients={clients} members={members} openNew={params.new === "1"} />;
}
