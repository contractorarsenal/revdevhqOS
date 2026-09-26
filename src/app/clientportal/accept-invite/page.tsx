import { createClient } from "@/lib/supabase/server";
import { hashInviteToken } from "@/server/portal-tokens";
import { getInviteLandingInfo } from "@/server/queries/client-portal";
import { PORTAL_ROLE_LABEL } from "@/lib/portal";
import { AcceptInviteForm } from "@/features/portal/accept-invite-form";
import { PortalPublicFrame } from "@/features/clientportal/public-frame";

export const metadata = { title: "You're invited — Contractor Arsenal" };

/**
 * Public invite landing. The token is only ever hashed server-side; an
 * invalid/expired/revoked token renders a safe explanation instead of the
 * form. The signed-in state decides which flow the form shows.
 */
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const info = token ? await getInviteLandingInfo(hashInviteToken(token)) : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <PortalPublicFrame title="You're invited" subtitle="Exclusive access for active Contractor Arsenal clients.">
      {!token || !info ? (
        <div className="text-center">
          <p className="text-[13px] font-semibold">This invitation link is not valid.</p>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">
            Check that you opened the full link, or ask your agency contact for a new invitation.
          </p>
        </div>
      ) : info.error ? (
        <p className="text-center text-[13px] font-semibold">{info.error}</p>
      ) : (
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">{info.businessName}</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            Your Contractor Arsenal account has already been prepared. Confirm your information to activate access.
          </p>
          <dl className="mt-3 space-y-1 border-y border-border py-2.5 text-[12px]">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Invited email</dt><dd className="font-medium">{info.email}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Your role</dt><dd className="font-medium">{PORTAL_ROLE_LABEL[info.role]}</dd></div>
          </dl>
          <AcceptInviteForm
            token={token}
            invitedEmail={info.email}
            businessName={info.businessName}
            signedInEmail={user?.email ?? null}
          />
        </div>
      )}
    </PortalPublicFrame>
  );
}
