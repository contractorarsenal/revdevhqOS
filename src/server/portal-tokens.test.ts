import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { generateInviteToken, hashInviteToken, tokenHashesMatch } from "./portal-tokens";

describe("invite tokens", () => {
  it("generates cryptographically sized, URL-safe, unique tokens", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const { token } = generateInviteToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes, base64url
      seen.add(token);
    }
    expect(seen.size).toBe(50);
  });

  it("the stored hash is SHA-256 of the token — never the token itself", () => {
    const { token, tokenHash } = generateInviteToken();
    expect(tokenHash).not.toContain(token);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hashInviteToken(token)).toBe(tokenHash);
  });

  it("compares hashes in constant time and rejects non-matching tokens", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(tokenHashesMatch(a.tokenHash, hashInviteToken(a.token))).toBe(true);
    expect(tokenHashesMatch(a.tokenHash, b.tokenHash)).toBe(false);
  });
});
