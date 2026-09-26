"use client";

import Link from "next/link";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { CheckCircle2, ChevronLeft, Circle, Download } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatBytes } from "@/lib/client-files";
import { getPortalFileUrl } from "@/server/actions/client-files";
import { PORTAL_REQUEST_STATUS } from "@/lib/portal-request-status";
import { type getPortalProject } from "@/server/queries/portal-data";
import { EmptyLine, Panel, PortalHeading, ProgressBar } from "./portal-ui";

type Project = NonNullable<Awaited<ReturnType<typeof getPortalProject>>>;

const dateOrDash = (d: string | null) => (d ? format(new Date(`${d}T12:00:00`), "MMM d, yyyy") : "—");

export function PortalProjectDetail({ project }: { project: Project }) {
  async function download(id: string) {
    const r = await getPortalFileUrl(id);
    if (!r.ok || !r.data) return toast.error(r.ok ? "Could not open that file." : r.error);
    window.location.assign(r.data.url);
  }

  return (
    <div>
      <Link href="/clientportal/projects" className="mb-3 inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3.5" /> Projects
      </Link>
      <PortalHeading title={project.name} description={project.summary ?? undefined}>
        <StatusBadge status={project.status} />
      </PortalHeading>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Waiting on", project.waitingOnLabel ?? "—"],
          ["Next action", project.nextAction ?? "—"],
          ["Start date", dateOrDash(project.startDate)],
          ["Target date", dateOrDash(project.dueDate)],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-md border border-border bg-card px-4 py-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{k}</p>
            <p className="mt-1 break-words text-[13.5px] font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 rounded-md border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <ProgressBar value={project.progress} className="flex-1" />
          <span className="tabular-nums text-[12px] font-semibold">{project.progress}%</span>
        </div>
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          {project.ownerName ? `Your Contractor Arsenal lead: ${project.ownerName} · ` : ""}Updated {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Project checklist" flush>
            {project.checklist.length === 0 ? (
              <EmptyLine>No checklist items have been shared yet.</EmptyLine>
            ) : (
              <ul>
                {project.checklist.map((t) => {
                  const done = t.status === "completed";
                  return (
                    <li key={t.id} className="flex items-center gap-3 border-t border-border px-4 py-2.5 first:border-t-0">
                      {done ? <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-label="Done" /> : <Circle className="size-4 shrink-0 text-muted-foreground" aria-label="Open" />}
                      <span className={`min-w-0 flex-1 text-[13px] ${done ? "text-muted-foreground line-through" : "font-medium"}`}>{t.title}</span>
                      {t.dueDate && <span className="shrink-0 text-[11.5px] text-muted-foreground">{format(new Date(t.dueDate), "MMM d")}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Project updates" flush>
            {project.updates.length === 0 ? (
              <EmptyLine>No updates yet.</EmptyLine>
            ) : (
              <ul>
                {project.updates.map((u) => (
                  <li key={u.id} className="border-t border-border px-4 py-3 first:border-t-0">
                    <p className="whitespace-pre-wrap text-[13px]">{u.body}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Contractor Arsenal · {formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Files" flush>
            {project.files.length === 0 ? (
              <EmptyLine>No files for this project.</EmptyLine>
            ) : (
              <ul>
                {project.files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 border-t border-border px-4 py-2.5 first:border-t-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">{f.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatBytes(f.sizeBytes)}</p>
                    </div>
                    <button onClick={() => download(f.id)} aria-label={`Download ${f.name}`} className="rounded-sm p-1.5 text-muted-foreground hover:text-foreground"><Download className="size-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Related requests" flush>
            {project.requests.length === 0 ? (
              <EmptyLine>No requests linked to this project.</EmptyLine>
            ) : (
              <ul>
                {project.requests.map((r) => (
                  <li key={r.id} className="border-t border-border px-4 py-2.5 first:border-t-0">
                    <p className="truncate text-[12.5px] font-medium">{r.description}</p>
                    <p className="text-[11px] text-muted-foreground">{PORTAL_REQUEST_STATUS[r.status]?.label}{r.clientUpdate ? ` · ${r.clientUpdate}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
