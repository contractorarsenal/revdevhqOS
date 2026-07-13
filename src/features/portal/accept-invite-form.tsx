"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { acceptClientInvite } from "@/server/actions/client-portal";
import { normalizeEmail } from "@/lib/portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Short activation form — the CRM already knows the business, so we only
 * ask for the person's own details. Three situations:
 * 1. Signed in with the invited email → accept directly.
 * 2. Signed in with a DIFFERENT email → explain, offer sign-out.
 * 3. Not signed in → create the account (Supabase signUp with the invited
 *    email, not editable) then accept. Every rule is re-enforced
 *    server-side; this form is convenience, not the security boundary.
 */
export function AcceptInviteForm({
  token, invitedEmail, businessName, signedInEmail,
}: {
  token: string;
  invitedEmail: string;
  businessName: string;
  signedInEmail: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const emailMismatch =
    signedInEmail !== null && normalizeEmail(signedInEmail) !== normalizeEmail(invitedEmail);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const fullName = String(form.get("fullName") ?? "");

    try {
      if (!signedInEmail) {
        const password = String(form.get("password") ?? "");
        if (password.length < 8) {
          setError("Choose a password with at least 8 characters.");
          return;
        }
        const supabase = createClient();
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalizeEmail(invitedEmail),
          password,
          options: { data: { name: fullName } },
        });
        if (signUpError) {
          // Existing account for this email — sign in instead of duplicating.
          if (/already/i.test(signUpError.message)) {
            setError("An account with this email already exists. Sign in first, then open this link again.");
          } else {
            setError(signUpError.message);
          }
          return;
        }
        if (!data.session) {
          setNeedsConfirmation(true);
          return;
        }
      }

      const result = await acceptClientInvite({
        token,
        fullName,
        phone: String(form.get("phone") ?? ""),
        title: String(form.get("title") ?? ""),
        confirmBusiness: form.get("confirmBusiness") === "on",
        acceptTerms: form.get("acceptTerms") === "on",
        emailNotifications: form.get("emailNotifications") === "on",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Hard navigation on purpose: the session was just created in this
      // very submit, so the SPA router cache still reflects the anonymous
      // user. A full load enters the portal with a clean, authed tree.
      window.location.assign(result.data?.destination ?? "/portal");
    } finally {
      setPending(false);
    }
  }

  if (needsConfirmation) {
    return (
      <p className="mt-4 rounded-md bg-muted px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
        Account created — this workspace requires email confirmation. Open the link we sent to{" "}
        <span className="font-medium">{invitedEmail}</span>, then return to this invitation link to
        finish activating access.
      </p>
    );
  }

  if (emailMismatch) {
    return (
      <div className="mt-4 space-y-3">
        <p className="rounded-md bg-muted px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
          You are signed in as <span className="font-medium">{signedInEmail}</span>, but this
          invitation was issued for <span className="font-medium">{invitedEmail}</span>. Sign out,
          then open the invitation link again.
        </p>
        <Button
          variant="outline"
          className="w-full"
          onClick={async () => {
            await createClient().auth.signOut();
            router.refresh();
          }}
        >
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div className="space-y-1">
        <Label htmlFor="fullName">Full name *</Label>
        <Input id="fullName" name="fullName" required maxLength={200} autoComplete="name" />
      </div>
      {!signedInEmail && (
        <div className="space-y-1">
          <Label htmlFor="password">Create a password *</Label>
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="Optional" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="title">Job title</Label>
          <Input id="title" name="title" placeholder="Optional" />
        </div>
      </div>
      <div className="space-y-2 pt-1">
        <label className="flex items-start gap-2 text-[12.5px] leading-snug">
          <input type="checkbox" name="confirmBusiness" required className="mt-0.5 accent-primary" />
          I confirm I am joining <span className="font-medium">{businessName}</span>
        </label>
        <label className="flex items-start gap-2 text-[12.5px] leading-snug">
          <input type="checkbox" name="acceptTerms" required className="mt-0.5 accent-primary" />
          I accept the terms of use
        </label>
        <label className="flex items-start gap-2 text-[12.5px] leading-snug text-muted-foreground">
          <input type="checkbox" name="emailNotifications" defaultChecked className="mt-0.5 accent-primary" />
          Email me important account updates
        </label>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Activating…" : "Activate access"}
      </Button>
    </form>
  );
}
