"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { changePassword } from "@/server/actions/account";
import { updatePortalAccount } from "@/server/actions/portal-account";
import { PORTAL_ROLE_LABEL, type ClientPortalRole } from "@/lib/portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, PortalHeading } from "./portal-ui";

export function PortalAccountView({
  name, email, company, role, canEditProfile,
}: { name: string; email: string; company: string; role: ClientPortalRole; canEditProfile: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pwError, setPwError] = useState<string | null>(null);

  function saveName(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await updatePortalAccount({ name: String(form.get("name")) });
      if (!r.ok) toast.error(r.error);
      else { toast.success("Profile updated"); router.refresh(); }
    });
  }

  function savePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPwError(null);
    const el = e.currentTarget;
    const form = new FormData(el);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) return setPwError("Passwords don't match.");
    startTransition(async () => {
      const r = await changePassword({ password });
      if (!r.ok) return setPwError(r.error);
      toast.success("Password updated");
      el.reset();
    });
  }

  return (
    <div>
      <PortalHeading title="Account" description="Your details and sign-in." />
      <div className="grid max-w-3xl gap-4 md:grid-cols-2">
        <Panel title="Profile">
          <form onSubmit={saveName} className="space-y-3">
            <div className="space-y-1"><Label htmlFor="pa-name">Name</Label><Input id="pa-name" name="name" defaultValue={name} required maxLength={120} disabled={!canEditProfile} /></div>
            <div className="space-y-1"><Label>Email</Label><Input value={email} disabled /><p className="text-[11px] text-muted-foreground">To change your email, contact your Contractor Arsenal account manager.</p></div>
            <div className="space-y-1"><Label>Company</Label><Input value={company} disabled /></div>
            <div className="space-y-1"><Label>Access level</Label><Input value={PORTAL_ROLE_LABEL[role]} disabled /></div>
            {canEditProfile && <Button type="submit" size="sm" disabled={pending}>Save profile</Button>}
          </form>
        </Panel>
        <Panel title="Change password">
          <form onSubmit={savePassword} className="space-y-3">
            <div className="space-y-1"><Label htmlFor="pa-pw">New password</Label><Input id="pa-pw" name="password" type="password" required minLength={8} autoComplete="new-password" /></div>
            <div className="space-y-1"><Label htmlFor="pa-pw2">Confirm new password</Label><Input id="pa-pw2" name="confirm" type="password" required minLength={8} autoComplete="new-password" /></div>
            {pwError && <p className="text-xs text-destructive">{pwError}</p>}
            <Button type="submit" size="sm" disabled={pending}>{pending ? "Updating…" : "Update password"}</Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
