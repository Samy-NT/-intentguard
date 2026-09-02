import { describe, expect, it } from "vitest";
import { AP2_COMPATIBILITY_PROFILE_VERSION, buildAp2CompatibilityProfile } from "@/lib/ap2";
import type { MandatePayload } from "@/lib/mandates";

const payload: MandatePayload = {
  mandate_id: "mandate_ap2",
  workspace_id: "workspace_1",
  issued_at: "2026-09-01T10:00:00.000Z",
  expires_at: "2026-09-02T10:00:00.000Z",
  mission_scope: "Buy approved SaaS renewals",
  agent_id: "agent_1",
  max_amount: 500,
  currency: "usd",
  allowed_recipients: ["billing@stripe.com"],
  allowed_merchants: ["stripe"],
  ap2: {
    protocol_version: "v0.2",
    mode: "human_not_present",
    vct: "mandate.payment.open.1",
    checkout_hash: "checkout_hash_1",
    transaction_id: "transaction_1",
  },
};

describe("AP2 compatibility profile", () => {
  it("maps Aurel mandate constraints to AP2 v0.2 concepts", () => {
    const profile = buildAp2CompatibilityProfile(payload);

    expect(profile).toMatchObject({
      protocol: "ap2",
      protocol_version: "v0.2",
      profile_version: AP2_COMPATIBILITY_PROFILE_VERSION,
      mode: "human_not_present",
    });
    expect(profile.mapped_constraints.map((constraint) => constraint.type)).toEqual([
      "payment.amount_range",
      "payment.allowed_payees",
      "checkout.allowed_merchants",
      "payment.execution_date",
    ]);
    expect(profile.context_bindings).toContainEqual({ field: "checkout_hash", value: "checkout_hash_1" });
    expect(profile.context_bindings).toContainEqual({ field: "transaction_id", value: "transaction_1" });
    expect(profile.limitations).toContain("Aurel signed mandates are not AP2 SD-JWTs.");
  });
});
