"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientFiles, projects } from "@/lib/db/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, actionError, type ActionResult } from "@/server/authorize";
import { authorizePortal } from "@/server/portal-authorize";
import { logActivity } from "@/server/activity";
import { assertWorkspaceClient } from "@/server/workspace-guards";
import { requestUploadSchema } from "@/lib/validation";
import {
  CLIENT_FILES_BUCKET, MAX_FILE_BYTES, buildStoragePath, isAllowedMime, isPathInScope,
} from "@/lib/client-files";

/**
 * Two-step signed upload: (1) the server authorizes, validates, records a
 * `pending` row and returns a one-time signed upload token for a path IT
 * chose; (2) after the browser uploads, the server verifies the object really
 * exists and flips the row to `ready`. Downloads are short-lived signed URLs
 * issued only after matching the file row to the caller's own scope.
 */

type Scope = { workspaceId: string; clientId: string };
type Actor = { profileId: string; byClient: boolean };

async function assertProjectInScope(scope: Scope, projectId: string | null | undefined, requireVisible: boolean) {
  if (!projectId) return;
  const conditions = [eq(projects.id, projectId), eq(projects.workspaceId, scope.workspaceId), eq(projects.clientId, scope.clientId)];
  if (requireVisible) conditions.push(eq(projects.clientVisible, true));
  const [row] = await db.select({ id: projects.id }).from(projects).where(and(...conditions)).limit(1);
  if (!row) throw new Error("Project not found.");
}

async function startUpload(scope: Scope, actor: Actor, input: unknown, requireVisibleProject: boolean) {
  const data = requestUploadSchema.parse(input);
  if (!isAllowedMime(data.mimeType)) throw new Error("That file type isn't supported. Upload images, PDFs, or Office documents.");
  if (data.sizeBytes > MAX_FILE_BYTES) throw new Error("Files can be up to 25 MB.");
  await assertProjectInScope(scope, data.projectId, requireVisibleProject);

  const id = randomUUID();
  const path = buildStoragePath(scope.workspaceId, scope.clientId, id, data.name);
  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage.from(CLIENT_FILES_BUCKET).createSignedUploadUrl(path);
  if (error || !signed) throw new Error("Could not start the upload. Try again.");

  await db.insert(clientFiles).values({
    id, workspaceId: scope.workspaceId, clientId: scope.clientId, projectId: data.projectId ?? null,
    name: data.name, storagePath: path, sizeBytes: data.sizeBytes, mimeType: data.mimeType ?? null,
    category: data.category, uploadedBy: actor.profileId, uploadedByClient: actor.byClient, status: "pending",
  });
  return { fileId: id, path, token: signed.token };
}

async function finishUpload(scope: Scope, actor: Actor, fileId: string) {
  const [row] = await db
    .select()
    .from(clientFiles)
    .where(and(
      eq(clientFiles.id, fileId), eq(clientFiles.workspaceId, scope.workspaceId),
      eq(clientFiles.clientId, scope.clientId), eq(clientFiles.status, "pending")
    ))
    .limit(1);
  if (!row || !isPathInScope(row.storagePath, scope.workspaceId, scope.clientId)) throw new Error("File not found.");

  const slash = row.storagePath.lastIndexOf("/");
  const dir = row.storagePath.slice(0, slash);
  const base = row.storagePath.slice(slash + 1);
  const admin = createAdminClient();
  const { data: listed, error } = await admin.storage.from(CLIENT_FILES_BUCKET).list(dir, { search: base, limit: 5 });
  const object = listed?.find((o) => o.name === base);
  if (error || !object) throw new Error("The upload didn't complete. Please try again.");

  await db.update(clientFiles).set({ status: "ready" }).where(eq(clientFiles.id, row.id));
  await logActivity({
    workspaceId: scope.workspaceId, actorId: actor.profileId, action: "client_file.uploaded",
    entityType: "client_file", entityId: row.id, clientId: scope.clientId,
    metadata: { name: row.name, byClient: actor.byClient },
  });
}

async function signedDownload(scope: Scope, fileId: string) {
  const [row] = await db
    .select()
    .from(clientFiles)
    .where(and(
      eq(clientFiles.id, fileId), eq(clientFiles.workspaceId, scope.workspaceId),
      eq(clientFiles.clientId, scope.clientId), eq(clientFiles.status, "ready"), isNull(clientFiles.archivedAt)
    ))
    .limit(1);
  if (!row || !isPathInScope(row.storagePath, scope.workspaceId, scope.clientId)) throw new Error("File not found.");
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(CLIENT_FILES_BUCKET).createSignedUrl(row.storagePath, 60, { download: row.name });
  if (error || !data) throw new Error("Could not open that file.");
  return data.signedUrl;
}

/* ===== portal (client) side — scope ALWAYS from the verified session ===== */

export async function requestPortalUpload(input: unknown): Promise<ActionResult<{ fileId: string; path: string; token: string }>> {
  try {
    const ctx = await authorizePortal("client_member");
    const r = await startUpload(ctx.membership, { profileId: ctx.user.id, byClient: true }, input, true);
    return { ok: true, data: r };
  } catch (err) { return actionError(err); }
}

export async function confirmPortalUpload(fileId: string): Promise<ActionResult> {
  try {
    const ctx = await authorizePortal("client_member");
    await finishUpload(ctx.membership, { profileId: ctx.user.id, byClient: true }, fileId);
    revalidatePath("/clientportal/files");
    revalidatePath("/clientportal/dashboard");
    return { ok: true };
  } catch (err) { return actionError(err); }
}

export async function getPortalFileUrl(fileId: string): Promise<ActionResult<{ url: string }>> {
  try {
    const ctx = await authorizePortal("client_read_only");
    return { ok: true, data: { url: await signedDownload(ctx.membership, fileId) } };
  } catch (err) { return actionError(err); }
}

/* ===== staff side ===== */

export async function requestStaffUpload(clientId: string, input: unknown): Promise<ActionResult<{ fileId: string; path: string; token: string }>> {
  try {
    const ctx = await authorize("member");
    await assertWorkspaceClient(ctx.workspace.id, clientId);
    const r = await startUpload({ workspaceId: ctx.workspace.id, clientId }, { profileId: ctx.user.id, byClient: false }, input, false);
    return { ok: true, data: r };
  } catch (err) { return actionError(err); }
}

export async function confirmStaffUpload(clientId: string, fileId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("member");
    await assertWorkspaceClient(ctx.workspace.id, clientId);
    await finishUpload({ workspaceId: ctx.workspace.id, clientId }, { profileId: ctx.user.id, byClient: false }, fileId);
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/clientportal/files");
    return { ok: true };
  } catch (err) { return actionError(err); }
}

export async function getStaffFileUrl(clientId: string, fileId: string): Promise<ActionResult<{ url: string }>> {
  try {
    const ctx = await authorize("viewer");
    await assertWorkspaceClient(ctx.workspace.id, clientId);
    return { ok: true, data: { url: await signedDownload({ workspaceId: ctx.workspace.id, clientId }, fileId) } };
  } catch (err) { return actionError(err); }
}

export async function archiveClientFile(clientId: string, fileId: string): Promise<ActionResult> {
  try {
    const ctx = await authorize("manager");
    await assertWorkspaceClient(ctx.workspace.id, clientId);
    await db
      .update(clientFiles)
      .set({ archivedAt: new Date() })
      .where(and(eq(clientFiles.id, fileId), eq(clientFiles.workspaceId, ctx.workspace.id), eq(clientFiles.clientId, clientId)));
    await logActivity({
      workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "client_file.archived",
      entityType: "client_file", entityId: fileId, clientId,
    });
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/clientportal/files");
    return { ok: true };
  } catch (err) { return actionError(err); }
}
