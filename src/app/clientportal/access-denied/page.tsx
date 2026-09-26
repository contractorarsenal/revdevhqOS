import { requireUser } from "@/lib/auth/session";
import { PortalSignOutButton } from "@/features/clientportal/signout-button";
import { PortalPublicFrame } from "@/features/clientportal/public-frame";

export const metadata = { title: "Access paused — Contractor Arsenal" };

/** Safe landing for suspended/revoked portal members. Requires a session
 * (so we know who they are) but deliberately NOT an active membership. */
export default async function ClientPortalAccessDeniedPage() {
  const user = await requireUser();
  return (
    <PortalPublicFrame title="Portal access is paused">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Access for {user.email} is currently suspended. If you believe this is a mistake, contact your Contractor Arsenal account manager.
      </p>
      <div className="mt-4"><PortalSignOutButton /></div>
    </PortalPublicFrame>
  );
}
