import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("allows a plain relative path", () => {
    expect(safeRedirectPath("/settings")).toBe("/settings");
    expect(safeRedirectPath("/clients/123")).toBe("/clients/123");
  });

  it("falls back for a missing value", () => {
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath(undefined)).toBe("/dashboard");
    expect(safeRedirectPath("")).toBe("/dashboard");
  });

  it("rejects an absolute external URL", () => {
    expect(safeRedirectPath("https://evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("http://evil.com/phishing")).toBe("/dashboard");
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("//evil.com/path")).toBe("/dashboard");
  });

  it("rejects a backslash trick some browsers normalize to protocol-relative", () => {
    expect(safeRedirectPath("/\\evil.com")).toBe("/dashboard");
  });

  it("rejects a path that doesn't start with a slash", () => {
    expect(safeRedirectPath("dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/dashboard");
  });

  it("uses the caller-supplied fallback", () => {
    expect(safeRedirectPath("https://evil.com", "/settings")).toBe("/settings");
  });

  it("allows a path with a query string", () => {
    expect(safeRedirectPath("/settings?tab=account")).toBe("/settings?tab=account");
  });
});
