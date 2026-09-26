/** Pure helpers for client file storage — no I/O, fully unit-testable. */

export const CLIENT_FILES_BUCKET = "client-files";
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "application/pdf", "text/plain", "text/csv", "application/zip",
  "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export function isAllowedMime(mime: string | null | undefined): boolean {
  return Boolean(mime) && ALLOWED_MIME.has(String(mime).toLowerCase());
}

/** Keeps a readable name but strips path separators / control characters so a
 * filename can never influence the storage path. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return cleaned || "file";
}

/** <workspaceId>/<clientId>/<uuid>-<name> — the scope is baked into the path,
 * but authorization never relies on it: rows in client_files decide access. */
export function buildStoragePath(workspaceId: string, clientId: string, uuid: string, name: string): string {
  return `${workspaceId}/${clientId}/${uuid}-${sanitizeFileName(name)}`;
}

export function isPathInScope(path: string, workspaceId: string, clientId: string): boolean {
  return path.startsWith(`${workspaceId}/${clientId}/`) && !path.includes("..");
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
