"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Eye, Mail, Pencil, ShieldOff, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  setPrimaryContact, inviteClientToPortal, regeneratePortalInviteLink, revokePortalInvite,
  suspendPortalAccess, restorePortalAccess, updateClientPortalSettings,
} from "@/server/actions/client-portal";
import { PORTAL_INDUSTRIES, PORTAL_ROLE_LABEL, industryAccent, resolveClientAccent } from "@/lib/portal";
import type { ClientPortalAccess } from "@/server/queries/client-portal";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function ClientPortalSection({
  clientId, client, access, canManage,
}: {
  clientId: string;
  client: { name: string; industry: string | null; portalAccentColor: string | null };
  access: ClientPortalAccess;
  canManage: boolean;
}) {
  const router = useRouter();
  const [contactOpen, setContactOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [industry, setIndustry] = useState(client.industry ?? "");
  const [accentOverride, setAccentOverride] = useState(client.portalAccentColor ?? "");

  const { primaryContact, pendingInvite, membership, lastInvitedAt } = access;
  const canInvite = Boolean(primaryContact?.email);
  const portalStatus = membership?.status ?? (pendingInvite && !pendingInvite.expired ? "invited" : "not_set_up");
  const effectiveAccent = resolveClientAccent({ portalAccentColor: accentOverride || null, industry: industry || null });

  async function run(promise: Promise<{ ok: boolean; error?: string }>, success: string) {
    setPending(true);
    const result = await promise;
    setPending(false);
    if (!result.ok) toast.error(result.error ?? "Action failed");
    else {
      toast.success(success);
      router.refresh();
    }
  }

  async function invite() {
    setPending(true);
    const result = await inviteClientToPortal(clientId, { role: "client_owner" });
    setPending(false);
    if (!result.ok) return void toast.error(result.error);
    setInviteLink(result.data?.link ?? null);
    toast.success(`Invitation created for ${result.data?.email}`);
    router.refresh();
  }

  async function copyLink() {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      return void toast.success("Invite link copied");
    }
    if (!pendingInvite) return;
    setPending(true);
    const result = await regeneratePortalInviteLink(pendingInvite.id);
    setPending(false);
    if (!result.ok) return void toast.error(result.error);
    await navigator.clipboard.writeText(result.data!.link);
    setInviteLink(result.data!.link);
    toast.success("Fresh invite link copied — the previous link no longer works");
  }

  async function saveContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    const result = await setPrimaryContact(clientId, {
      name: String(form.get("name")),
      email: String(form.get("email")),
      phone: String(form.get("phone") ?? ""),
      title: String(form.get("title") ?? ""),
    });
    setPending(false);
    if (!result.ok) return void toast.error(result.error);
    toast.success("Primary contact saved");
    setContactOpen(false);
    router.refresh();
  }

  async function saveTheme() {
    await run(
      updateClientPortalSettings(clientId, { industry, portalAccentColor: accentOverride }),
      "Portal branding saved"
    );
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
          <h2 className="text-[12.5px] font-semibold">Client Portal Access</h2>
          <span className="ml-auto"><StatusBadge status={portalStatus.replace(/_/g, " ")} tone={portalStatus === "active" ? "green" : portalStatus === "suspended" || portalStatus === "revoked" ? "red" : "neutral"} /></span>
        </header>

        <dl className="grid gap-x-6 gap-y-2 px-4 py-3 text-[12.5px] sm:grid-cols-2">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Primary contact</dt><dd className="text-right font-medium">{primaryContact?.name ?? "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Contact email</dt><dd className="truncate text-right font-medium">{primaryContact?.email ?? "—"}</dd></div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Invitation</dt>
            <dd className="text-right font-medium">
              {pendingInvite
                ? pendingInvite.expired
                  ? "Expired"
                  : `Pending · expires ${new Date(pendingInvite.expiresAt).toLocaleDateString()}`
                : membership?.acceptedAt
                  ? "Accepted"
                  : "None"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Portal user</dt>
            <dd className="text-right font-medium">
              {membership ? `${membership.profileName} (${membership.profileEmail})` : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Client role</dt><dd className="text-right font-medium">{PORTAL_ROLE_LABEL[(membership?.role ?? pendingInvite?.role ?? "client_owner") as keyof typeof PORTAL_ROLE_LABEL]}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Last invited</dt><dd className="text-right font-medium">{lastInvitedAt ? new Date(lastInvitedAt).toLocaleDateString() : "—"}</dd></div>
          {membership?.acceptedAt && (
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Accepted</dt><dd className="text-right font-medium">{new Date(membership.acceptedAt).toLocaleDateString()}</dd></div>
          )}
        </dl>

        {pendingInvite?.emailStale && (
          <p className="mx-4 mb-3 rounded-md bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            The pending invitation was sent to {pendingInvite.email}, which no longer matches the
            current primary contact email. Revoke it and invite again to use the new address.
          </p>
        )}
        {!canInvite && (
          <p className="mx-4 mb-3 rounded-md bg-muted px-3 py-2 text-[11.5px] text-muted-foreground">
            A primary contact email is required before this client can be invited to the portal.
          </p>
        )}
        {inviteLink && (
          <div className="mx-4 mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="min-w-0 flex-1 truncate text-[11.5px] font-medium">{inviteLink}</p>
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={copyLink}>
              <Copy className="size-3" /> Copy
            </Button>
          </div>
        )}
        {inviteLink && (
          <p className="mx-4 mb-3 text-[11px] text-muted-foreground">
            Email delivery is not configured — copy this secure link and send it to the client
            yourself. It is shown only once; use Copy Invite Link later to issue a fresh one.
          </p>
        )}

        {canManage && (
          <div className="flex flex-wrap gap-2 border-t border-border/60 px-4 py-3">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setContactOpen(true)}>
              <Pencil className="size-3.5" /> Edit Primary Contact
            </Button>
            {(!membership || membership.status === "revoked") && !pendingInvite && (
              <Button size="sm" className="gap-1.5" disabled={!canInvite || pending} onClick={invite} title={canInvite ? undefined : "Add a primary contact email first"}>
                <Mail className="size-3.5" /> Invite to Portal
              </Button>
            )}
            {pendingInvite && !pendingInvite.expired && (
              <>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={pending} onClick={copyLink}>
                  <Copy className="size-3.5" /> Copy Invite Link
                </Button>
                <ConfirmationDialog
                  trigger={<Button size="sm" variant="outline" className="gap-1.5 text-muted-foreground"><XCircle className="size-3.5" /> Revoke Invite</Button>}
                  title="Revoke this invitation?"
                  description={`The link sent to ${pendingInvite.email} will stop working immediately.`}
                  confirmLabel="Revoke"
                  destructive
                  onConfirm={() => run(revokePortalInvite(pendingInvite.id), "Invitation revoked")}
                />
              </>
            )}
            {pendingInvite?.expired && (
              <Button size="sm" className="gap-1.5" disabled={pending} onClick={invite}>
                <Mail className="size-3.5" /> Re-invite
              </Button>
            )}
            {membership?.status === "active" && (
              <ConfirmationDialog
                trigger={<Button size="sm" variant="outline" className="gap-1.5 text-muted-foreground"><ShieldOff className="size-3.5" /> Suspend Access</Button>}
                title="Suspend portal access?"
                description={`${membership.profileName} will be locked out of the portal until access is restored.`}
                confirmLabel="Suspend"
                destructive
                onConfirm={() => run(suspendPortalAccess(membership.id), "Access suspended")}
              />
            )}
            {membership?.status === "suspended" && (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={pending} onClick={() => run(restorePortalAccess(membership.id), "Access restored")}>
                <ShieldCheck className="size-3.5" /> Restore Access
              </Button>
            )}
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href={`/clients/${clientId}/portal-preview`}>
                <Eye className="size-3.5" /> Preview Client View
              </Link>
            </Button>
          </div>
        )}
      </section>

      {canManage && (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h3 className="text-[12.5px] font-semibold">Portal branding</h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            The industry sets a default accent; the override always wins. Color is used for small
            details only.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Industry</Label>
              <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                <option value="">Not set</option>
                {PORTAL_INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Accent override</Label>
              <div className="flex items-center gap-2">
                <Input value={accentOverride} onChange={(e) => setAccentOverride(e.target.value)} placeholder={industry ? industryAccent(industry) : "#DC2626"} className="h-9" />
                <span aria-hidden className="size-6 shrink-0 rounded-md border border-border" style={{ backgroundColor: effectiveAccent }} title={`Effective accent ${effectiveAccent}`} />
              </div>
            </div>
          </div>
          <div className="mt-3">
            <Button size="sm" disabled={pending} onClick={saveTheme}>Save branding</Button>
          </div>
        </section>
      )}

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{primaryContact ? "Edit primary contact" : "Add primary contact"}</DialogTitle></DialogHeader>
          <form onSubmit={saveContact} className="space-y-3">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input name="name" required defaultValue={primaryContact?.name ?? ""} />
            </div>
            <div className="space-y-1">
              <Label>Email *</Label>
              <Input name="email" type="email" required defaultValue={primaryContact?.email ?? ""} />
              <p className="text-[11px] text-muted-foreground">Used for the portal invitation and sign-in. Stored lowercase.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input name="phone" defaultValue={primaryContact?.phone ?? ""} />
              </div>
              <div className="space-y-1">
                <Label>Job title</Label>
                <Input name="title" defaultValue={primaryContact?.title ?? ""} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setContactOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save contact"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
