"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { updateWorkspace } from "@/server/actions/workspace";
import { createStage, updateStage, moveStage } from "@/server/actions/pipeline";
import { canAdminister, type WorkspaceRole } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClientAvatar } from "@/components/shared/client-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Stage = { id: string; name: string; probability: number; position: number; isWon: boolean; isLost: boolean };
type Member = { id: string; userId: string; name: string; email: string; role: string };

export function SettingsView({
  workspace, role, members, stages,
}: {
  workspace: { name: string; timezone: string; slug: string };
  role: WorkspaceRole;
  members: Member[];
  stages: Stage[];
}) {
  const router = useRouter();
  const admin = canAdminister(role);
  const [pending, startTransition] = useTransition();
  const [stageDialog, setStageDialog] = useState<Stage | "new" | null>(null);

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
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="members">Team members</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline stages</TabsTrigger>
        </TabsList>

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
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 border-t border-border/40 px-4 py-3 first:border-t-0">
                <ClientAvatar name={m.name} className="rounded-full" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{m.name}</p>
                  <p className="text-[11.5px] text-muted-foreground">{m.email}</p>
                </div>
                <StatusBadge status={m.role} tone={m.role === "owner" ? "indigo" : "neutral"} />
              </div>
            ))}
          </section>
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            Invitations are not part of this MVP — additional members can be added directly in the database and will be
            enforced by workspace membership checks.
          </p>
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
    </div>
  );
}
