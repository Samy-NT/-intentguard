import { afterEach, describe, expect, it } from "vitest";
import {
  MANDATE_SIGNATURE_VERSION,
  evaluateMandate,
  signMandate,
  verifyMandateSignature,
  type MandatePayload,
  type SignedMandate,
} from "@/lib/mandates";
import type { PaymentIntent } from "@/types";

const payload: MandatePayload = {
  mandate_id: "mandate_test",
  workspace_id: "ws_1",
  issued_at: "2026-09-01T10:00:00.000Z",
  expires_at: "2030-09-02T10:00:00.000Z",
  mission_scope: "Manage approved SaaS renewals",
  agent_id: "agent_1",
  max_amount: 500,
  currency: "USD",
  allowed_recipients: ["billing@stripe.com"],
  allowed_merchants: ["stripe"],
  allowed_categories: ["saas"],
};

function signed(overrides: Partial<MandatePayload> = {}): SignedMandate {
  const next = { ...payload, ...overrides };
  return {
    payload: next,
    signature: signMandate(next, "mandate-secret"),
    signature_version: MANDATE_SIGNATURE_VERSION,
  };
}

function intent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    intent_id: "intent_1",
    workspace_id: "ws_1",
    agent_id: "agent_1",
    amount: 250,
    currency: "USD",
    recipient: "billing@stripe.com",
    merchant_id: "stripe",
    metadata: { category: "saas" },
    ...overrides,
  };
}

describe("signed mandates", () => {
  afterEach(() => {
    delete process.env.MANDATE_SIGNING_SECRET;
    delete process.env.MANDATE_SIGNING_PREVIOUS_SECRETS;
    delete process.env.AUDIT_SIGNING_SECRET;
    delete process.env.AUDIT_SIGNING_PREVIOUS_SECRETS;
    delete process.env.INTENTGUARD_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("signs and verifies a mandate payload", () => {
    const mandate = signed();
    expect(mandate.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyMandateSignature(mandate, "mandate-secret")).toBe(true);
    expect(
      verifyMandateSignature(
        { ...mandate, payload: { ...mandate.payload, max_amount: 501 } },
        "mandate-secret"
      )
    ).toBe(false);
  });

  it("allows an intent that stays inside mandate constraints", () => {
    process.env.MANDATE_SIGNING_SECRET = "mandate-secret";
    expect(evaluateMandate(intent(), signed(), new Date("2026-09-01T11:00:00.000Z"))).toBeNull();
  });

  it("verifies historical mandates with previous signing secrets after rotation", () => {
    const mandate = signed();
    process.env.MANDATE_SIGNING_SECRET = "new-mandate-secret";
    process.env.MANDATE_SIGNING_PREVIOUS_SECRETS = "older-mandate-secret, mandate-secret";

    expect(verifyMandateSignature(mandate)).toBe(true);
    expect(signMandate(payload)).toBe(signMandate(payload, "new-mandate-secret"));
  });

  it("blocks expired mandates", () => {
    process.env.MANDATE_SIGNING_SECRET = "mandate-secret";
    const result = evaluateMandate(
      intent(),
      signed({ expires_at: "2026-09-02T10:00:00.000Z" }),
      new Date("2026-09-03T11:00:00.000Z")
    );
    expect(result).toMatchObject({ decision: "block", reason: "Mandate has expired" });
  });

  it("blocks intents outside mandate amount and recipient constraints", () => {
    process.env.MANDATE_SIGNING_SECRET = "mandate-secret";
    expect(evaluateMandate(intent({ amount: 900 }), signed())?.reason).toContain("mandate cap");
    expect(evaluateMandate(intent({ recipient: "attacker@example.com" }), signed())?.reason).toContain(
      "recipient list"
    );
  });

  it("blocks AP2-bound intents with mismatched checkout or transaction references", () => {
    process.env.MANDATE_SIGNING_SECRET = "mandate-secret";
    const mandate = signed({
      ap2: {
        protocol_version: "v0.2",
        mode: "human_not_present",
        vct: "mandate.payment.open.1",
        checkout_hash: "checkout_hash_1",
        transaction_id: "transaction_1",
      },
    });

    expect(
      evaluateMandate(
        intent({ metadata: { category: "saas", checkout_hash: "checkout_hash_1", transaction_id: "transaction_1" } }),
        mandate
      )
    ).toBeNull();
    expect(evaluateMandate(intent({ metadata: { category: "saas", checkout_hash: "other" } }), mandate)?.reason).toBe(
      "Intent checkout hash does not match the AP2 mandate binding"
    );
    expect(
      evaluateMandate(
        intent({ metadata: { category: "saas", checkout_hash: "checkout_hash_1", transaction_id: "other" } }),
        mandate
      )?.reason
    ).toBe("Intent transaction id does not match the AP2 mandate binding");
  });
});
