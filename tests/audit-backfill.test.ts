import { describe, expect, it } from "vitest";
import { AUDIT_SIGNATURE_VERSION, signAuditDecision, verifyAuditDecisionSignature } from "@/lib/audit";
import { auditRecordFromLog } from "@/lib/audit-backfill";

describe("auditRecordFromLog", () => {
  it("rebuilds the exact signed audit record from a verify_logs row", () => {
    const record = auditRecordFromLog({
      id: "log_1",
      workspace_id: "ws_1",
      intent_id: "pay_1",
      agent_id: "agent_1",
      recipient: "billing@stripe.com",
      merchant_id: null,
      amount: "250.5",
      currency: "USD",
      decision: "allow",
      triggered_rule: null,
      risk_score: "5",
      created_at: "2026-07-11T12:00:00.000Z",
    });

    expect(record).toMatchObject({
      amount: 250.5,
      risk_score: 5,
      evaluated_at: "2026-07-11T12:00:00.000Z",
    });

    const signature = signAuditDecision(record, "test-secret");
    expect(verifyAuditDecisionSignature(record, signature, "test-secret")).toBe(true);
    expect(verifyAuditDecisionSignature({ ...record, risk_score: 6 }, signature, "test-secret")).toBe(false);
    expect(AUDIT_SIGNATURE_VERSION).toBe("audit-v1-hmac-sha256");
  });
});
