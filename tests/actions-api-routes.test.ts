import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "@/lib/auth";

const mocks = vi.hoisted(() => ({
  auth: {
    db: {},
    workspace_id: "ws_1",
    api_key_id: "key_1",
    role: "operator" as "admin" | "operator" | "viewer",
  },
  authenticateRequest: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  recordLayerMetric: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    authenticateRequest: mocks.authenticateRequest,
  };
});

vi.mock("@/lib/workspaces", () => ({
  getWorkspaceConfig: mocks.getWorkspaceConfig,
}));

vi.mock("@/lib/monitoring", () => ({
  recordLayerMetric: mocks.recordLayerMetric,
  captureError: mocks.captureError,
}));

function request(body: unknown, headers: Record<string, string> = {}): Request {
  const encoded = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("https://aurel.test/api", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: encoded,
  });
}

function actionBody(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    integration: "test",
    action: { id: "act_1", name: "read_file", arguments: { path: "README.md" } },
    agent: { id: "agent_1", sessionId: "session_1", runId: "run_1" },
    timestamp: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

function telemetryBody(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    integration: "test",
    actionId: "act_1",
    outcome: { status: "success" },
    timestamp: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

function authenticated(role: "admin" | "operator" | "viewer" = "operator"): AuthenticatedRequest {
  return { ...mocks.auth, role } as unknown as AuthenticatedRequest;
}

describe("action API routes", () => {
  beforeEach(() => {
    mocks.authenticateRequest.mockReset();
    mocks.getWorkspaceConfig.mockReset();
    mocks.getWorkspaceConfig.mockResolvedValue({ policy: null, webhook: null, semantic_fail_mode: "flag" });
    mocks.authenticateRequest.mockResolvedValue(authenticated());
    mocks.recordLayerMetric.mockReset();
    mocks.captureError.mockReset();
  });

  it("requires operator privileges for action evaluation", async () => {
    mocks.authenticateRequest.mockResolvedValueOnce(authenticated("viewer"));
    const { POST } = await import("@/app/api/v1/actions/evaluate/route");

    const response = await POST(request(actionBody()) as never);

    expect(response.status).toBe(403);
    expect(mocks.getWorkspaceConfig).not.toHaveBeenCalled();
  });

  it("evaluates actions for operator keys", async () => {
    const { POST } = await import("@/app/api/v1/actions/evaluate/route");

    const response = await POST(request(actionBody()) as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ decision: "allow", riskScore: 5 });
    expect(mocks.recordLayerMetric).toHaveBeenCalledWith(
      expect.objectContaining({ layer: "action_evaluation", workspace_id: "ws_1" })
    );
  });

  it("accepts client idempotency keys on action evaluation", async () => {
    const { POST } = await import("@/app/api/v1/actions/evaluate/route");

    const response = await POST(request(actionBody(), { "idempotency-key": "action-evaluate:act_1" }) as never);

    expect(response.status).toBe(200);
    expect(mocks.getWorkspaceConfig).toHaveBeenCalled();
  });

  it("rejects malformed idempotency keys before action evaluation", async () => {
    const { POST } = await import("@/app/api/v1/actions/evaluate/route");

    const response = await POST(request(actionBody(), { "idempotency-key": "bad key" }) as never);

    expect(response.status).toBe(400);
    expect(mocks.getWorkspaceConfig).not.toHaveBeenCalled();
  });

  it("rejects oversized action payloads using content-length before parsing", async () => {
    const { POST } = await import("@/app/api/v1/actions/evaluate/route");

    const response = await POST(request(actionBody(), { "content-length": "64001" }) as never);

    expect(response.status).toBe(413);
    expect(mocks.getWorkspaceConfig).not.toHaveBeenCalled();
  });

  it("requires operator privileges for action telemetry", async () => {
    mocks.authenticateRequest.mockResolvedValueOnce(authenticated("viewer"));
    const { POST } = await import("@/app/api/v1/actions/telemetry/route");

    const response = await POST(request(telemetryBody()) as never);

    expect(response.status).toBe(403);
    expect(mocks.recordLayerMetric).not.toHaveBeenCalled();
  });

  it("accepts client idempotency keys on action telemetry", async () => {
    const { POST } = await import("@/app/api/v1/actions/telemetry/route");

    const response = await POST(request(telemetryBody(), { "idempotency-key": "action-telemetry:act_1:success" }) as never);

    expect(response.status).toBe(200);
    expect(mocks.recordLayerMetric).toHaveBeenCalled();
  });

  it("rejects malformed idempotency keys before telemetry ingestion", async () => {
    const { POST } = await import("@/app/api/v1/actions/telemetry/route");

    const response = await POST(request(telemetryBody(), { "idempotency-key": "bad key" }) as never);

    expect(response.status).toBe(400);
    expect(mocks.recordLayerMetric).not.toHaveBeenCalled();
  });

  it("acknowledges telemetry without echoing submitted metadata", async () => {
    const { POST } = await import("@/app/api/v1/actions/telemetry/route");

    const response = await POST(
      request(telemetryBody({ metadata: { authorization: "Bearer secret", riskScore: 88 } })) as never
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ accepted: true });
    expect(mocks.recordLayerMetric).toHaveBeenCalledWith(
      expect.objectContaining({ layer: "action_telemetry", risk_score: 88, workspace_id: "ws_1" })
    );
  });
});
