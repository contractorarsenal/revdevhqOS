import { describe, expect, it } from "vitest";
import { clientSchema, subscriptionSchema, paymentSchema, invoiceSchema, taskSchema, goalSchema, goalProgressSchema } from "./index";

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

describe("goalSchema", () => {
  const base = { name: "Monthly Revenue", metricType: "revenue_collected", periodType: "monthly", month: "2026-07", targetValue: 10000 };

  it("accepts a valid monthly revenue goal", () => {
    const parsed = goalSchema.parse(base);
    expect(parsed.targetValue).toBe(10000);
    expect(parsed.isPrimary).toBe(false);
  });

  it("rejects a zero or negative target", () => {
    expect(() => goalSchema.parse({ ...base, targetValue: 0 })).toThrow();
    expect(() => goalSchema.parse({ ...base, targetValue: -5 })).toThrow();
  });

  it("requires the anchor matching the period type", () => {
    expect(() => goalSchema.parse({ ...base, month: undefined })).toThrow();
    expect(() => goalSchema.parse({ ...base, periodType: "quarterly" })).toThrow();
    expect(() => goalSchema.parse({ ...base, periodType: "custom" })).toThrow();
  });

  it("rejects custom end before start", () => {
    expect(() =>
      goalSchema.parse({ ...base, periodType: "custom", customStart: "2026-07-10", customEnd: "2026-07-01" })
    ).toThrow();
  });

  it("rejects a negative manual starting value but allows zero", () => {
    expect(() => goalSchema.parse({ ...base, manualStartValue: -1 })).toThrow();
    expect(goalSchema.parse({ ...base, manualStartValue: 0 }).manualStartValue).toBe(0);
    expect(goalSchema.parse({ ...base, manualStartValue: "" }).manualStartValue).toBeNull();
  });
});

describe("goalProgressSchema", () => {
  it("accepts non-negative values, including above any target", () => {
    expect(goalProgressSchema.parse({ value: 320 }).value).toBe(320);
    expect(goalProgressSchema.parse({ value: 0 }).value).toBe(0);
  });
  it("rejects negative progress", () => {
    expect(() => goalProgressSchema.parse({ value: -3 })).toThrow();
  });
});
