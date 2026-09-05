import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  checkWorkspaceRateLimit: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  runRuleEngine: vi.fn(),
  analyzeIntent: vi.fn(),
  assertEnv: vi.fn(),
  signAuditDecision: vi.fn(),
  recordLayerMetric: vi.fn(),
  captureError: vi.fn(),
  enqueueWebhookJob: vi.fn(),
  shouldEscalate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authenticateRequest: mocks.authenticateRequest,
}));

vi.mock("@/lib/ratelimit", () => ({
  checkWorkspaceRateLimit: mocks.checkWorkspaceRateLimit,
}));

vi.mock("@/lib/workspaces", () => ({
  getWorkspaceConfig: mocks.getWorkspaceConfig,
}));

vi.mock("@/lib/rules/engine", () => ({
  runRuleEngine: mocks.runRuleEngine,
}));

vi.mock("@/lib/claude/analyze", () => ({
  analyzeIntent: mocks.analyzeIntent,
}));

vi.mock("@/lib/env", () => ({
  assertEnv: mocks.assertEnv,
}));

vi.mock("@/lib/audit", () => ({
  AUDIT_SIGNATURE_VERSION: "audit-v1-hmac-sha256",
  signAuditDecision: mocks.signAuditDecision,
  canonicalizeAuditValue: (value: unknown) => JSON.stringify(value),
}));

vi.mock("@/lib/monitoring", () => ({
  recordLayerMetric: mocks.recordLayerMetric,
  captureError: mocks.captureError,
}));

vi.mock("@/lib/webhooks/queue", () => ({
  enqueueWebhookJob: mocks.enqueueWebhookJob,
}));

vi.mock("@/lib/webhooks/notify", () => ({
  shouldEscalate: mocks.shouldEscalate,
}));

import { POST } from "@/app/api/verify/route";

function verifyRequest(): NextRequest {
  return new Request("http://localhost/api/v1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": "ig_live_test" },
    body: JSON.stringify({
      intent_id: "pay_entitlement_test",
      agent_id: "ag_test",
      amount: 100,
      currency: "USD",
      recipient: "billing@vendor.com",
    }),
  }) as unknown as NextRequest;
}

function dbWithExistingAndUsageCount(count: number) {
  const existingQuery = {
    eq: vi.fn(() => existingQuery),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  const countQuery = {
    eq: vi.fn(() => countQuery),
    gte: vi.fn(() => Promise.resolve({ count, error: null })),
  };
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn((_columns: string, options?: { count?: string; head?: boolean }) => {
        if (table === "verify_logs" && options?.count === "exact" && options?.head === true) return countQuery;
        return existingQuery;
      }),
    })),
  };
}

describe("verify route entitlements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateRequest.mockResolvedValue({
      db: dbWithExistingAndUsageCount(0),
      workspace_id: "ws_test",
      api_key_id: "key_test",
      role: "admin",
    });
    mocks.checkWorkspaceRateLimit.mockResolvedValue({ allowed: true });
    mocks.getWorkspaceConfig.mockResolvedValue({ policy: null, webhook: null, semantic_fail_mode: "flag" });
    mocks.runRuleEngine.mockResolvedValue({
      decision: "allow",
      reason: "ok",
      risk_score: 0,
      triggered_rule: null,
    });
    mocks.signAuditDecision.mockReturnValue("signature");
    mocks.shouldEscalate.mockReturnValue(false);
  });

  it("blocks suspended workspaces before idempotency, rules, and semantic work", async () => {
    mocks.getWorkspaceConfig.mockResolvedValue({
      policy: { workspace_status: "suspended" },
      webhook: null,
      semantic_fail_mode: "flag",
    });

    const response = await POST(verifyRequest());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "Workspace is suspended. Verification is disabled until access is restored.",
    });
    expect(mocks.runRuleEngine).not.toHaveBeenCalled();
    expect(mocks.analyzeIntent).not.toHaveBeenCalled();
  });

  it("blocks new verification work when the monthly quota is reached", async () => {
    mocks.authenticateRequest.mockResolvedValue({
      db: dbWithExistingAndUsageCount(10),
      workspace_id: "ws_test",
      api_key_id: "key_test",
      role: "admin",
    });
    mocks.getWorkspaceConfig.mockResolvedValue({
      policy: { monthly_verification_limit: 10 },
      webhook: null,
      semantic_fail_mode: "flag",
    });

    const response = await POST(verifyRequest());

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({
      error: "Workspace monthly verification limit reached (10/10).",
    });
    expect(mocks.runRuleEngine).not.toHaveBeenCalled();
    expect(mocks.analyzeIntent).not.toHaveBeenCalled();
  });
});
