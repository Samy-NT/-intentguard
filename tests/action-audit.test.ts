import { describe, expect, it } from "vitest";
import { verifyActionAuditDecisionSignature, ACTION_AUDIT_SIGNATURE_VERSION } from "@/lib/audit";
import { buildActionAudit, hashActionPayload } from "@/lib/action-audit";
import type { AurelActionRequest } from "@/lib/actions/protocol";

const action: AurelActionRequest = {
  version: "1",
  integration: "test",
  action: { id: "act_1", name: "read_file", arguments: { path: "README.md" } },
  agent: { id: "agent_1" },
  timestamp: "2026-08-27T00:00:00.000Z",
};

describe("generic action audit records", () => {
  it("hashes canonical action payloads deterministically", () => {
    const reordered = { ...action, action: { ...action.action, arguments: { path: "README.md" } } };
    expect(hashActionPayload(action)).toBe(hashActionPayload(reordered));
  });

  it("signs a minimal action decision and verifies it", () => {
    const result = buildActionAudit(
      "ws_1",
      action,
      { decision: "allow", reason: "ok", riskScore: 4, traceId: "trace_1" },
      "2026-08-27T00:00:01.000Z",
      "test-secret"
    );
    expect(result.signature_version).toBe(ACTION_AUDIT_SIGNATURE_VERSION);
    expect(verifyActionAuditDecisionSignature(result.record, result.signature, "test-secret")).toBe(true);
    expect(result.signature).toHaveLength(64);
  });

  it("does not include action arguments in the signed audit record", () => {
    const result = buildActionAudit("ws_1", action, { decision: "block", riskScore: 95 }, undefined, "test-secret");
    expect(result.record).not.toHaveProperty("arguments");
    expect(result.record.payload_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("verifies an exported action audit record through the public verifier", async () => {
    const result = buildActionAudit("ws_1", action, { decision: "allow", riskScore: 4 }, "2026-08-27T00:00:01.000Z", "test-secret");
    const { POST } = await import("@/app/api/audit/action-verify/route");
    const previousSecret = process.env.AUDIT_SIGNING_SECRET;
    process.env.AUDIT_SIGNING_SECRET = "test-secret";
    try {
      const response = await POST(new Request("https://aurel.test/api/audit/action-verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ record: result.record, audit_signature: result.signature }),
      }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ valid: true, audit_signature_version: ACTION_AUDIT_SIGNATURE_VERSION });
    } finally {
      if (previousSecret === undefined) delete process.env.AUDIT_SIGNING_SECRET;
      else process.env.AUDIT_SIGNING_SECRET = previousSecret;
    }
  });
});
