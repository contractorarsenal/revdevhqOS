import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { FolderKanban } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import type { listPortalProjects } from "@/server/queries/portal-data";
import { PortalHeading, ProgressBar } from "./portal-ui";

type Projects = Awaited<ReturnType<typeof listPortalProjects>>;

export function PortalProjectsView({ projects }: { projects: Projects }) {
  return (
    <div>
      <PortalHeading title="Projects" description="Everything Contractor Arsenal is building for you." />
      {projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects shared yet" description="Projects appear here once Contractor Arsenal shares them with you." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <Link key={p.id} href={`/clientportal/projects/${p.id}`} className="group block min-w-0 rounded-md border border-border bg-card p-4 transition-colors hover:border-muted-foreground/40">
              <div className="flex items-start gap-2">
                <h2 className="min-w-0 flex-1 truncate text-[14.5px] font-semibold group-hover:underline">{p.name}</h2>
                <StatusBadge status={p.status} />
              </div>
              {p.summary && <p className="mt-1.5 line-clamp-2 text-[12.5px] text-muted-foreground">{p.summary}</p>}
              <div className="mt-3 flex items-center gap-3">
                <ProgressBar value={p.progress} className="flex-1" />
                <span className="tabular-nums text-[11.5px] text-muted-foreground">{p.progress}%</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                <div className="min-w-0"><dt className="text-muted-foreground">Waiting on</dt><dd className="truncate font-medium">{p.waitingOnLabel ?? "—"}</dd></div>
                <div className="min-w-0"><dt className="text-muted-foreground">Next action</dt><dd className="truncate font-medium">{p.nextAction ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Target date</dt><dd className="font-medium">{p.dueDate ? format(new Date(`${p.dueDate}T12:00:00`), "MMM d, yyyy") : "—"}</dd></div>
                <div><dt className="text-muted-foreground">Updated</dt><dd className="font-medium">{formatDistanceToNow(new Date(p.updatedAt), { addSuffix: true })}</dd></div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
