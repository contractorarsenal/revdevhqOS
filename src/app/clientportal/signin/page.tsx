import Link from "next/link";
import { PortalPublicFrame } from "@/features/clientportal/public-frame";
import { PortalSignInForm } from "@/features/clientportal/signin-form";

export const metadata = { title: "Client sign in — Contractor Arsenal" };

export default function ClientPortalSignInPage() {
  return (
    <PortalPublicFrame title="Client portal" subtitle="Sign in to see your projects, requests, leads, and billing.">
      <PortalSignInForm />
      <p className="mt-4 text-[12px] text-muted-foreground">
        Need access? Ask your Contractor Arsenal contact for an invitation.
      </p>
      <p className="mt-2 text-[11.5px] text-muted-foreground">
        Contractor Arsenal team member? <Link href="/sign-in" className="font-medium text-foreground underline-offset-2 hover:underline">Team sign in</Link>
      </p>
    </PortalPublicFrame>
  );
}
