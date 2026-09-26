import { requireClientPortalUser } from "@/lib/auth/session";
import { ClientPortalShell } from "@/features/clientportal/shell";

export const metadata = { title: "Client portal — Contractor Arsenal" };
export const dynamic = "force-dynamic";

/** Every page below re-runs the same guard (cached per request): the active
 * membership, client, and workspace are resolved server-side — never from a
 * URL, cookie, or form field the browser controls. */
export default async function ClientPortalAppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireClientPortalUser();
  return <ClientPortalShell clientName={ctx.client.name} userName={ctx.user.name}>{children}</ClientPortalShell>;
}
