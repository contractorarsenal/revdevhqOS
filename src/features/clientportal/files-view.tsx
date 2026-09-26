"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Download, Files, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CLIENT_FILES_BUCKET, MAX_FILE_BYTES, formatBytes, isAllowedMime } from "@/lib/client-files";
import { FILE_CATEGORIES } from "@/lib/validation";
import { getPortalFileUrl, requestPortalUpload, confirmPortalUpload } from "@/server/actions/client-files";
import type { PortalFileRow } from "@/server/queries/portal-data";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { PortalHeading } from "./portal-ui";

export function PortalFilesView({
  files, projects, canUpload,
}: { files: PortalFileRow[]; projects: { id: string; name: string }[]; canUpload: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<(typeof FILE_CATEGORIES)[number]>("other");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!isAllowedMime(file.type)) return toast.error("That file type isn't supported. Upload images, PDFs, or Office documents.");
    if (file.size > MAX_FILE_BYTES) return toast.error("Files can be up to 25 MB.");
    setBusy(true);
    try {
      const started = await requestPortalUpload({ name: file.name, sizeBytes: file.size, mimeType: file.type, category, projectId });
      if (!started.ok || !started.data) throw new Error(started.ok ? "Upload failed." : started.error);
      const { error } = await createClient().storage.from(CLIENT_FILES_BUCKET).uploadToSignedUrl(started.data.path, started.data.token, file, { contentType: file.type });
      if (error) throw new Error("Upload failed. Please try again.");
      const done = await confirmPortalUpload(started.data.fileId);
      if (!done.ok) throw new Error(done.error);
      toast.success("File uploaded");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function download(id: string) {
    const r = await getPortalFileUrl(id);
    if (!r.ok || !r.data) return toast.error(r.ok ? "Could not open that file." : r.error);
    window.location.assign(r.data.url);
  }

  return (
    <div>
      <PortalHeading title="Files" description="Logos, images, documents, and deliverables — shared between you and Contractor Arsenal." />
      {canUpload && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-card p-3">
          <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} aria-label="File category" className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm capitalize">
            {FILE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {projects.length > 0 && (
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project" className="h-9 max-w-[14rem] rounded-md border border-input bg-transparent px-2.5 text-sm">
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <input ref={input} type="file" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => input.current?.click()}>
            <Upload className="size-3.5" /> {busy ? "Uploading…" : "Upload file"}
          </Button>
          <p className="text-[11.5px] text-muted-foreground">Up to 25 MB. Images, PDFs, and Office documents.</p>
        </div>
      )}

      {files.length === 0 ? (
        <EmptyState icon={Files} title="No files yet" description="Upload brand assets or check back for deliverables from Contractor Arsenal." />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{f.name}</p>
                <p className="text-[11.5px] text-muted-foreground">
                  <span className="capitalize">{f.category}</span> · {formatBytes(f.sizeBytes)} · {format(new Date(f.createdAt), "MMM d, yyyy")} · {f.uploadedByClient ? "You" : "Contractor Arsenal"}
                </p>
              </div>
              <button onClick={() => download(f.id)} aria-label={`Download ${f.name}`} className="rounded-sm p-2 text-muted-foreground hover:text-foreground"><Download className="size-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
