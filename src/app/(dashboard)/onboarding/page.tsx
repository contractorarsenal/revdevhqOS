import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/session";
import { listOnboarding } from "@/server/queries/onboarding";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ClipboardList } from "lucide-react";
import { OnboardingBoard } from "@/features/onboarding/onboarding-board";
import { Button } from "@/components/ui/button";

export default async function OnboardingPage() {
  const ctx = await requireWorkspace();
  const entries = await listOnboarding(ctx.workspace.id);

  return (
    <div>
      <PageHeader
        title="Client Onboarding"
        description="Move new clients from signed contract to active service without dropped steps."
      />
      {entries.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No clients in onboarding"
          description="Start onboarding from a client page (Overview → Start onboarding), or win a deal — conversion starts it automatically."
          action={<Button asChild size="sm"><Link href="/clients">Open clients</Link></Button>}
        />
      ) : (
        <OnboardingBoard entries={entries} />
      )}
    </div>
  );
}
