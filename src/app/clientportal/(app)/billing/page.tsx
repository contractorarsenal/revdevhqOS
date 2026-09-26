import { db } from "@/lib/db";
import { authorizePortal } from "@/server/portal-authorize";
import { getPortalBilling } from "@/server/queries/portal-data";
import { PortalBillingView } from "@/features/clientportal/billing-view";

export default async function ClientPortalBillingPage() {
  const ctx = await authorizePortal("client_read_only");
  const billing = await getPortalBilling(db, { workspaceId: ctx.membership.workspaceId, clientId: ctx.membership.clientId });
  return <PortalBillingView billing={billing} />;
}
