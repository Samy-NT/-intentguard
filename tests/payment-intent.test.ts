import { describe, expect, it } from "vitest";
import { getMissionScope, hashPaymentIntent } from "@/lib/payment-intent";

describe("getMissionScope", () => {
  it("prefers the top-level mission_scope field", () => {
    expect(
      getMissionScope({
        mission_scope: " Manage SaaS renewals ",
        metadata: { mission_scope: "Fallback scope" },
      })
    ).toBe("Manage SaaS renewals");
  });

  it("falls back to metadata.mission_scope for older clients", () => {
    expect(getMissionScope({ metadata: { mission_scope: "Procurement only" } })).toBe("Procurement only");
  });

  it("uses mandate mission scope when the intent does not include one", () => {
    expect(
      getMissionScope({
        mandate: {
          payload: {
            mandate_id: "mandate_1",
            workspace_id: "ws_1",
            issued_at: "2026-09-01T00:00:00.000Z",
            expires_at: "2026-09-02T00:00:00.000Z",
            mission_scope: "Buy approved SaaS renewals",
          },
          signature: "a".repeat(64),
        },
      })
    ).toBe("Buy approved SaaS renewals");
  });

  it("ignores empty or non-string values", () => {
    expect(getMissionScope({ mission_scope: " ", metadata: { mission_scope: 42 } })).toBeUndefined();
  });
});

describe("hashPaymentIntent", () => {
  it("is stable for equivalent key orderings", () => {
    expect(hashPaymentIntent({ intent_id: "pay_1", amount: 10, currency: "USD" }))
      .toBe(hashPaymentIntent({ currency: "USD", amount: 10, intent_id: "pay_1" }));
  });

  it("changes when security-relevant payload fields change", () => {
    const base = { intent_id: "pay_1", amount: 10, currency: "USD", recipient: "vendor@example.com" };
    expect(hashPaymentIntent(base)).not.toBe(hashPaymentIntent({ ...base, recipient: "attacker@example.com" }));
  });
});
