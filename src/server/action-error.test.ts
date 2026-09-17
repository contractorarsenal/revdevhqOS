import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DrizzleQueryError } from "drizzle-orm";
import { actionError } from "./action-error";

describe("actionError — Save Branding's 'ugly error' bug", () => {
  it("turns a Zod validation failure into its field message, not the raw issue dump", () => {
    const schema = z.object({ primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #E11D48") });
    const result = schema.safeParse({ primaryColor: "#123" });
    if (result.success) throw new Error("expected validation to fail");
    const { error } = actionError(result.error);
    expect(error).toBe("Use a hex color like #E11D48");
    expect(error).not.toContain("{");
  });

  it("passes a plain Error's message through unchanged", () => {
    const { error } = actionError(new Error("Calendar event not found in this workspace."));
    expect(error).toBe("Calendar event not found in this workspace.");
  });

  it("falls back to a generic message for a non-Error throw", () => {
    const { error } = actionError("some string thrown directly");
    expect(error).toBe("Something went wrong. Try again.");
  });
});

describe("actionError — sanitizes DrizzleQueryError instead of leaking raw SQL", () => {
  it("never lets the raw 'Failed query: ...' text reach the client for a generic DB failure", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new DrizzleQueryError(
      'insert into "clients" ("id", "name") values ($1, $2)',
      ["11111111-1111-1111-1111-111111111111", "Acme Co"],
      new Error("connection terminated unexpectedly")
    );
    const { error } = actionError(err);
    expect(error).toBe("Something went wrong saving that. Please try again.");
    expect(error).not.toContain("insert into");
    expect(error).not.toContain("Acme Co");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("gives a friendly duplicate message for a unique-violation cause (SQLSTATE 23505)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new DrizzleQueryError(
      'insert into "services" ("workspace_id", "name") values ($1, $2)',
      ["ws-1", "Website Maintenance"],
      Object.assign(new Error("duplicate key value"), { code: "23505", constraint: "services_workspace_name_unique" })
    );
    const { error } = actionError(err);
    expect(error).toBe("That already exists — check for a duplicate and try again.");
    spy.mockRestore();
  });
});
