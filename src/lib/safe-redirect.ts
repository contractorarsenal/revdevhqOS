/**
 * Validates a caller-supplied post-auth redirect target. Only a same-origin
 * relative path is ever allowed — an absolute URL, a protocol-relative URL
 * ("//evil.com"), or anything malformed falls back to a safe default. This
 * is the one gate standing between a crafted `next` query param on the
 * email-confirmation link and an open redirect to an attacker's site.
 */
export function safeRedirectPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  try {
    // A same-origin relative path must resolve to the SAME origin as the
    // arbitrary base below — "https://evil.com" or "//evil.com" resolve to
    // a different origin and are rejected regardless of how they're spelled.
    const base = "http://localhost";
    const resolved = new URL(next, base);
    if (resolved.origin !== base) return fallback;
    return next;
  } catch {
    return fallback;
  }
}
