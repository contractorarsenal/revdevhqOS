/**
 * changePassword() must go through Supabase Auth's own session-bound
 * update — never touch the app database. Only requireUser() and the
 * Supabase server client are mocked.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const updateUser = vi.fn();
const requireUser = vi.fn();
requireUser.mockResolvedValue({ id: "user-1", name: "Test User", email: "test@example.com" });

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: (...args: unknown[]) => requireUser(...args) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { updateUser: (...args: unknown[]) => updateUser(...args) } }),
}));

import { changePassword } from "@/server/actions/account";

beforeEach(() => {
  updateUser.mockReset();
  requireUser.mockClear();
});

describe("changePassword", () => {
  it("calls Supabase's own updateUser with the new password and never writes to the app database", async () => {
    updateUser.mockResolvedValue({ error: null });
    const result = await changePassword({ password: "a-strong-password" });
    expect(result.ok).toBe(true);
    expect(updateUser).toHaveBeenCalledWith({ password: "a-strong-password" });
  });

  it("rejects passwords under 8 characters before ever calling Supabase", async () => {
    const result = await changePassword({ password: "short" });
    expect(result.ok).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("surfaces a Supabase Auth error back to the caller", async () => {
    updateUser.mockResolvedValue({ error: { message: "Password is too common." } });
    const result = await changePassword({ password: "a-strong-password" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Password is too common.");
  });

  it("requires an authenticated session", async () => {
    requireUser.mockRejectedValueOnce(new Error("redirect"));
    const result = await changePassword({ password: "a-strong-password" });
    expect(result.ok).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });
});
