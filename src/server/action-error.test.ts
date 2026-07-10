import { describe, expect, it } from "vitest";
import { z } from "zod";
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
