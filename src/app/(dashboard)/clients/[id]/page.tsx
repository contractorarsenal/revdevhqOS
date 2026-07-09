import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getClientDetail } from "@/server/queries/clients";
import { listMembers } from "@/server/queries/members";
import { listServices, listInvoices } from "@/server/queries/billing";
import { ClientDetailView } from "@/features/clients/client-detail-view";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireWorkspace();
  const [detail, members, services, workspaceInvoices] = await Promise.all([
    getClientDetail(ctx.workspace.id, id).catch(() => null),
    listMembers(ctx.workspace.id),
    listServices(ctx.workspace.id),
    listInvoices(ctx.workspace.id),
  ]);
  if (!detail) notFound();
  return (
    <ClientDetailView detail={detail} members={members} services={services} allInvoices={workspaceInvoices} />
  );
}
