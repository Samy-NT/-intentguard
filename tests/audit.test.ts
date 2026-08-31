import { describe, expect, it } from "vitest";
import {
  AUDIT_SIGNATURE_VERSION,
  canonicalizeAuditValue,
  signAuditDecision,
  verifyAuditDecisionSignature,
  type AuditDecisionRecord,
} from "@/lib/audit";

const record: AuditDecisionRecord = {
  workspace_id: "00000000-0000-0000-0000-000000000001",
  intent_id: "pay_2026_0001",
  agent_id: "agent_1",
  recipient: "billing@stripe.com",
  merchant_id: null,
  amount: 250,
  currency: "USD",
  decision: "allow",
  triggered_rule: null,
  risk_score: 5,
  evaluated_at: "2026-07-11T12:00:00.000Z",
};

describe("audit signatures", () => {
  it("canonicalizes object keys deterministically", () => {
    expect(canonicalizeAuditValue({ b: 2, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":2}'
    );
  });

  it("signs and verifies a decision record", () => {
    const signature = signAuditDecision(record, "test-secret");

    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyAuditDecisionSignature(record, signature, "test-secret")).toBe(true);
  });

  it("fails verification when any signed field changes", () => {
    const signature = signAuditDecision(record, "test-secret");

    expect(
      verifyAuditDecisionSignature({ ...record, decision: "block" }, signature, "test-secret")
    ).toBe(false);
  });

  it("exposes a stable version identifier", () => {
    expect(AUDIT_SIGNATURE_VERSION).toBe("audit-v1-hmac-sha256");
  });
});
