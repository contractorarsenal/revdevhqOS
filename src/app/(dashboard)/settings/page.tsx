import { requireWorkspace } from "@/lib/auth/session";
import { listMembers } from "@/server/queries/members";
import { listStages } from "@/server/queries/pipeline";
import { SettingsView } from "@/features/settings/settings-view";

export default async function SettingsPage() {
  const ctx = await requireWorkspace();
  const [members, stages] = await Promise.all([listMembers(ctx.workspace.id), listStages(ctx.workspace.id)]);
  return (
    <SettingsView
      workspace={{ name: ctx.workspace.name, timezone: ctx.workspace.timezone, slug: ctx.workspace.slug }}
      role={ctx.role}
      members={members}
      stages={stages}
    />
  );
}
