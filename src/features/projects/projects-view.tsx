"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Plus, FolderKanban, Archive } from "lucide-react";
import { archiveProject } from "@/server/actions/projects";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { ProjectFormDialog } from "./project-form-dialog";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ProjectsView({ projects, members, clients }: { projects: any[]; members: any[]; clients: any[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const active = projects.filter((p) => p.status !== "archived");

  return (
    <div>
      <PageHeader title="Projects" description="Organize related tasks into larger bodies of work.">
        <Button size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}><Plus className="size-3.5" /> New Project</Button>
      </PageHeader>
      {active.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects yet" description="Group related tasks — a website build, a campaign, a launch."
          action={<Button size="sm" onClick={() => setFormOpen(true)}><Plus className="size-3.5" /> New Project</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {active.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start gap-2">
                <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color ?? "#4F46E5" }} />
                <div className="min-w-0 flex-1">
                  <Link href={`/projects/${p.id}`} className="truncate text-[13.5px] font-semibold hover:underline">{p.name}</Link>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">{p.clientName ?? "Internal"} · {p.ownerName ?? "Unassigned"}</p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{p.completedCount}/{p.taskCount} tasks · {p.progress}%</span>
                {p.dueDate && <span>Due {p.dueDate}</span>}
              </div>
              <div className="mt-3 flex justify-end">
                <ConfirmationDialog
                  trigger={<Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground"><Archive className="size-3.5" /> Archive</Button>}
                  title="Archive this project?" description="It will be hidden from the active list; its tasks are kept." confirmLabel="Archive" destructive
                  onConfirm={async () => {
                    const result = await archiveProject(p.id);
                    if (!result.ok) toast.error(result.error);
                    else { toast.success("Project archived"); router.refresh(); }
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <ProjectFormDialog open={formOpen} onOpenChange={setFormOpen} members={members} clients={clients} />
    </div>
  );
}
