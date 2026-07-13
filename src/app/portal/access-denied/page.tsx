import { requireUser } from "@/lib/auth/session";
import { SignOutButton } from "@/components/layout/sign-out-button";

export const metadata = { title: "Access paused — Contractor Arsenal" };

/** Safe landing for suspended/revoked portal members. Requires a session
 * (so we know who they are) but deliberately NOT an active membership. */
export default async function PortalAccessDeniedPage() {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <span aria-hidden className="mx-auto mb-3 block size-2.5 bg-red-600" />
        <h1 className="text-[15px] font-semibold tracking-tight">Portal access is paused</h1>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
          Access for {user.email} is currently suspended. If you believe this is a mistake,
          contact your Contractor Arsenal account manager.
        </p>
        <div className="mt-4 flex justify-center">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
