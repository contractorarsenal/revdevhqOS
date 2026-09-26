import { authorizePortal } from "@/server/portal-authorize";
import { PortalAccountView } from "@/features/clientportal/account-view";

export default async function ClientPortalAccountPage() {
  const ctx = await authorizePortal("client_read_only");
  return (
    <PortalAccountView
      name={ctx.user.name}
      email={ctx.user.email}
      company={ctx.client.name}
      role={ctx.membership.role}
      canEditProfile
    />
  );
}
