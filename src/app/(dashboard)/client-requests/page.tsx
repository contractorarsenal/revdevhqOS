import { requireWorkspace } from "@/lib/auth/session";
import { listClientRequests } from "@/server/queries/client-requests";
import { listClients } from "@/server/queries/clients";
import { listMembers } from "@/server/queries/members";
import { ClientRequestsView } from "@/features/client-requests/client-requests-view";

export default async function ClientRequestsPage() {
  const ctx = await requireWorkspace();
  const [items, clients, members] = await Promise.all([
    listClientRequests(ctx.workspace.id),
    listClients(ctx.workspace.id),
    listMembers(ctx.workspace.id),
  ]);
  return (
    <ClientRequestsView
      items={items}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      members={members.map((m) => ({ userId: m.userId, name: m.name }))}
    />
  );
}
