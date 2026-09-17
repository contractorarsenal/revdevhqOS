"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { updateWorkspace, updateWorkspaceBranding } from "@/server/actions/workspace";
import { createStage, updateStage, moveStage } from "@/server/actions/pipeline";
import { inviteMember, updateMemberRole, removeMember } from "@/server/actions/members";
import { changePassword } from "@/server/actions/account";
import { canAdminister, type WorkspaceRole } from "@/lib/permissions";
import { WORKSPACE_ROLES } from "@/lib/validation";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClientAvatar } from "@/components/shared/client-avatar";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Stage = { id: string; name: string; probability: number; position: number; isWon: boolean; isLost: boolean };
type Member = { id: string; userId: string; name: string; email: string; role: string };

export function SettingsView({
  workspace, role, members, stages, account,
}: {
  workspace: {
    name: string; timezone: string; slug: string; businessName?: string | null;
    primaryColor?: string | null; accentColor?: string | null;
    businessEmail?: string | null; businessPhone?: string | null; website?: string | null;
  };
  role: WorkspaceRole;
  members: Member[];
  stages: Stage[];
  account: { userId: string; name: string; email: string };
}) {
  const router = useRouter();
  const admin = canAdminister(role);
  const isOwner = role === "owner";
  const [pending, startTransition] = useTransition();
  const [stageDialog, setStageDialog] = useState<Stage | "new" | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function submitInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInviteError(null);
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await inviteMember({
        name: String(form.get("name")),
        email: String(form.get("email")),
        role: String(form.get("role")),
      });
      if (!result.ok) return setInviteError(result.error);
      toast.success("Invitation sent");
      setInviteOpen(false);
      router.refresh();
    });
  }

  function changeMemberRole(member: Member, newRole: string) {
    startTransition(async () => {
      const result = await updateMemberRole(member.id, { role: newRole });
      if (!result.ok) toast.error(result.error);
      else { toast.success("Role updated"); router.refresh(); }
    });
  }

  function confirmRemove() {
    if (!removeTarget) return;
    const target = removeTarget;
    startTransition(async () => {
      const result = await removeMember(target.id);
      if (!result.ok) toast.error(result.error);
      else { toast.success("Access removed"); setRemoveTarget(null); router.refresh(); }
    });
  }

  function submitPasswordChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordError(null);
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    const confirm = String(form.get("confirm"));
    if (password !== confirm) return setPasswordError("Passwords do not match.");
    startTransition(async () => {
      const result = await changePassword({ password });
      if (!result.ok) return setPasswordError(result.error);
      toast.success("Password updated");
      e.currentTarget.reset();
    });
  }

  function saveWorkspace(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateWorkspace({
        name: String(form.get("name")),
        timezone: String(form.get("timezone")),
      });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Workspace saved");
        router.refresh();
      }
    });
  }

  function saveStage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = { name: String(form.get("name")), probability: Number(form.get("probability")) };
    startTransition(async () => {
      const result =
        stageDialog === "new" ? await createStage(payload) : await updateStage((stageDialog as Stage).id, payload);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Stage saved");
        setStageDialog(null);
        router.refresh();
      }
    });
  }

  function saveBranding(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateWorkspaceBranding({
        businessName: String(form.get("businessName") ?? ""),
        primaryColor: String(form.get("primaryColor") ?? ""),
        accentColor: String(form.get("accentColor") ?? ""),
        businessEmail: String(form.get("businessEmail") ?? ""),
        businessPhone: String(form.get("businessPhone") ?? ""),
        website: String(form.get("website") ?? ""),
      });
      if (!result.ok) toast.error(result.error);
      else { toast.success("Branding saved"); router.refresh(); }
    });
  }

  async function reorder(stage: Stage, direction: "up" | "down") {
    const result = await moveStage(stage.id, direction);
    if (!result.ok) toast.error(result.error);
    else router.refresh();
  }

  return (
    <div>
      <PageHeader title="Settings" description="Configure the workspace, team, and pipeline structure." />
      <Tabs defaultValue="workspace">
        <TabsList>
          <TabsTrigger value="account">My account</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="members">Team members</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline stages</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-4">
          <section className="max-w-lg rounded-lg border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-[12.5px] font-semibold">Profile</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={account.name} disabled />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input value={account.email} disabled />
              </div>
            </div>
          </section>

          <section className="mt-4 max-w-lg rounded-lg border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-[12.5px] font-semibold">Change password</h3>
            <form onSubmit={submitPasswordChange} className="space-y-3">
              <div className="space-y-1">
                <Label>New password</Label>
                <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
              </div>
              <div className="space-y-1">
                <Label>Confirm new password</Label>
                <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
              </div>
              {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
              <Button type="submit" size="sm" disabled={pending}>{pending ? "Updating…" : "Update password"}</Button>
            </form>
          </section>

          <section className="mt-4 max-w-lg rounded-lg border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-[12.5px] font-semibold">Session</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await createClient().auth.signOut();
                router.push("/sign-in");
                router.refresh();
              }}
            >
              Sign out
            </Button>
          </section>
        </TabsContent>

        <TabsContent value="workspace" className="mt-4">
          <section className="max-w-lg rounded-lg border border-border bg-card p-4 shadow-sm">
            <form onSubmit={saveWorkspace} className="space-y-3">
              <div className="space-y-1">
                <Label>Workspace name</Label>
                <Input name="name" defaultValue={workspace.name} disabled={!admin} />
              </div>
              <div className="space-y-1">
                <Label>Timezone</Label>
                <Input name="timezone" defaultValue={workspace.timezone} disabled={!admin} />
                <p className="text-[11px] text-muted-foreground">IANA name, e.g. America/Phoenix. Used for “collected today / this month”.</p>
              </div>
              <div className="space-y-1">
                <Label>Workspace slug</Label>
                <Input value={workspace.slug} disabled />
              </div>
              {admin && (
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? "Saving…" : "Save changes"}
                </Button>
              )}
            </form>
          </section>

          <section className="mt-4 max-w-lg rounded-lg border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-[12.5px] font-semibold">Branding</h3>
            <form onSubmit={saveBranding} className="space-y-3">
              <div className="space-y-1">
                <Label>Business / agency name</Label>
                <Input name="businessName" defaultValue={workspace.businessName ?? ""} disabled={!admin} placeholder="Contractor Arsenal" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Primary color</Label>
                  <Input name="primaryColor" type="text" defaultValue={workspace.primaryColor ?? ""} disabled={!admin} placeholder="#DC2626" />
                </div>
                <div className="space-y-1">
                  <Label>Accent color</Label>
                  <Input name="accentColor" type="text" defaultValue={workspace.accentColor ?? ""} disabled={!admin} placeholder="#EA580C" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Business email</Label>
                <Input name="businessEmail" defaultValue={workspace.businessEmail ?? ""} disabled={!admin} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Business phone</Label>
                  <Input name="businessPhone" defaultValue={workspace.businessPhone ?? ""} disabled={!admin} />
                </div>
                <div className="space-y-1">
                  <Label>Website</Label>
                  <Input name="website" defaultValue={workspace.website ?? ""} disabled={!admin} />
                </div>
              </div>
              {admin && <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save branding"}</Button>}
            </form>
          </section>
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <header className="flex items-center border-b border-border/60 px-4 py-2.5">
              <h2 className="text-[12.5px] font-semibold">Team members</h2>
              {isOwner && (
                <Button
                  variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2 text-xs"
                  onClick={() => { setInviteError(null); setInviteOpen(true); }}
                >
                  <Plus className="size-3.5" /> Invite member
                </Button>
              )}
            </header>
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 border-t border-border/40 px-4 py-3 first:border-t-0">
                <ClientAvatar name={m.name} className="rounded-full" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{m.name}</p>
                  <p className="text-[11.5px] text-muted-foreground">{m.email}</p>
                </div>
                {isOwner && m.userId !== account.userId ? (
                  <select
                    value={m.role}
                    onChange={(e) => changeMemberRole(m, e.target.value)}
                    disabled={pending}
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                  >
                    {WORKSPACE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                ) : (
                  <StatusBadge status={m.role} tone={m.role === "owner" ? "indigo" : "neutral"} />
                )}
                {isOwner && m.userId !== account.userId && (
                  <Button
                    variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => setRemoveTarget(m)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </section>
        </TabsContent>

        <TabsContent value="pipeline" className="mt-4">
          <section className="max-w-2xl overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <header className="flex items-center border-b border-border/60 px-4 py-2.5">
              <h2 className="text-[12.5px] font-semibold">Stages</h2>
              {admin && (
                <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2 text-xs" onClick={() => setStageDialog("new")}>
                  <Plus className="size-3.5" /> Add stage
                </Button>
              )}
            </header>
            {stages.map((stage, i) => (
              <div key={stage.id} className="flex items-center gap-3 border-t border-border/40 px-4 py-2.5 first:border-t-0">
                <span className="w-5 text-center text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
                <button
                  className="min-w-0 flex-1 text-left text-[13px] font-medium hover:underline disabled:no-underline"
                  disabled={!admin}
                  onClick={() => setStageDialog(stage)}
                >
                  {stage.name}
                </button>
                {stage.isWon && <StatusBadge status="won" />}
                {stage.isLost && <StatusBadge status="lost" />}
                <span className="w-12 text-right text-[12px] tabular-nums text-muted-foreground">{stage.probability}%</span>
                {admin && (
                  <span className="flex gap-0.5">
                    <Button variant="ghost" size="icon" className="size-7" disabled={i === 0} onClick={() => reorder(stage, "up")}>
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" disabled={i === stages.length - 1} onClick={() => reorder(stage, "down")}>
                      <ArrowDown className="size-3.5" />
                    </Button>
                  </span>
                )}
              </div>
            ))}
          </section>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(stageDialog)} onOpenChange={(o) => !o && setStageDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{stageDialog === "new" ? "Add stage" : "Edit stage"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveStage} className="space-y-3">
            <div className="space-y-1">
              <Label>Stage name</Label>
              <Input name="name" required defaultValue={stageDialog !== "new" && stageDialog ? stageDialog.name : ""} />
            </div>
            <div className="space-y-1">
              <Label>Win probability (%)</Label>
              <Input
                name="probability" type="number" min={0} max={100} required
                defaultValue={stageDialog !== "new" && stageDialog ? stageDialog.probability : 10}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStageDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={pending}>Save stage</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={(o) => !o && setInviteOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Invite team member</DialogTitle>
            <DialogDescription>They receive a Supabase sign-in invite by email and set their own password.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitInvite} className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input name="name" required placeholder="Jane Doe" />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input name="email" type="email" required placeholder="jane@contractorarsenal.com" />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <select name="role" defaultValue="member" className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm">
                {WORKSPACE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {inviteError && <p className="text-xs text-destructive">{inviteError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send invite"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removeTarget)} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove access</DialogTitle>
            <DialogDescription>
              {removeTarget?.name} will lose access to this workspace. Their account is not deleted and can be
              re-added later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={confirmRemove}>
              {pending ? "Removing…" : "Remove access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
