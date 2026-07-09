import { describe, expect, it } from "vitest";
import { clientSchema, subscriptionSchema, paymentSchema, invoiceSchema, taskSchema } from "./index";

describe("clientSchema", () => {
  it("requires a name and normalizes empty optionals to null", () => {
    const parsed = clientSchema.parse({ name: "Summit Roofing", website: "", email: "" });
    expect(parsed.name).toBe("Summit Roofing");
    expect(parsed.website).toBeNull();
    expect(parsed.email).toBeNull();
    expect(parsed.status).toBe("onboarding");
  });
  it("rejects an empty name and a bad email", () => {
    expect(() => clientSchema.parse({ name: "" })).toThrow();
    expect(() => clientSchema.parse({ name: "X", email: "nope" })).toThrow();
  });
});

describe("subscriptionSchema", () => {
  it("coerces amount and requires uuids", () => {
    const parsed = subscriptionSchema.parse({
      clientId: "0b8f4a52-7d55-4bf1-9f0a-1f2d3c4b5a69",
      serviceId: "1b8f4a52-7d55-4bf1-9f0a-1f2d3c4b5a69",
      amount: "1400", frequency: "monthly", startDate: "2026-07-01",
    });
    expect(parsed.amount).toBe(1400);
  });
  it("rejects negative amounts", () => {
    expect(() =>
      subscriptionSchema.parse({
        clientId: "0b8f4a52-7d55-4bf1-9f0a-1f2d3c4b5a69",
        serviceId: "1b8f4a52-7d55-4bf1-9f0a-1f2d3c4b5a69",
        amount: -5, startDate: "2026-07-01",
      })
    ).toThrow();
  });
});

describe("paymentSchema", () => {
  it("rejects zero payments", () => {
    expect(() => paymentSchema.parse({ amount: 0, paidAt: "2026-07-08" })).toThrow();
  });
  it("defaults status to succeeded", () => {
    expect(paymentSchema.parse({ amount: 100, paidAt: "2026-07-08" }).status).toBe("succeeded");
  });
});

describe("invoiceSchema", () => {
  it("requires at least one line item", () => {
    expect(() =>
      invoiceSchema.parse({ clientId: "0b8f4a52-7d55-4bf1-9f0a-1f2d3c4b5a69", number: "INV-1", items: [] })
    ).toThrow();
  });
});

describe("taskSchema", () => {
  it("defaults status/priority", () => {
    const parsed = taskSchema.parse({ title: "Kickoff call" });
    expect(parsed.status).toBe("todo");
    expect(parsed.priority).toBe("medium");
  });
});

describe("optional relation fields", () => {
  it("accept empty strings from form selects and normalize to null", () => {
    const parsed = taskSchema.parse({ title: "T", clientId: "", leadId: "", opportunityId: "" });
    expect(parsed.clientId).toBeNull();
    expect(parsed.leadId).toBeNull();
    expect(parsed.opportunityId).toBeNull();
  });
  it("still reject non-uuid garbage", () => {
    expect(() => taskSchema.parse({ title: "T", clientId: "not-a-uuid" })).toThrow();
  });
});
