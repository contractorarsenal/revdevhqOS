import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Invite token handling. The plaintext token appears exactly once — inside
 * the invite link returned to the internal owner — and is NEVER stored or
 * logged; only its SHA-256 hash is persisted.
 */
export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison of two token hashes. */
export function tokenHashesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
