import { describe, expect, it } from "vitest";
import { hasRole, canWrite, canManageBilling, canAdminister, assertRole } from "./index";

describe("workspace role hierarchy", () => {
  it("owner outranks everyone", () => {
    expect(hasRole("owner", "admin")).toBe(true);
    expect(hasRole("owner", "viewer")).toBe(true);
  });
  it("viewer cannot write", () => {
    expect(canWrite("viewer")).toBe(false);
    expect(canWrite("member")).toBe(true);
  });
  it("billing requires manager or above", () => {
    expect(canManageBilling("member")).toBe(false);
    expect(canManageBilling("manager")).toBe(true);
    expect(canManageBilling("admin")).toBe(true);
  });
  it("administration requires admin or above", () => {
    expect(canAdminister("manager")).toBe(false);
    expect(canAdminister("admin")).toBe(true);
  });
  it("assertRole throws for insufficient roles", () => {
    expect(() => assertRole("member", "admin")).toThrow();
    expect(() => assertRole("owner", "admin")).not.toThrow();
  });
});
