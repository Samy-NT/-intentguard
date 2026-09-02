import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  db: {},
  createServerClient: vi.fn(),
  validateDashboardSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/dashboard-session", () => ({
  validateDashboardSession: mocks.validateDashboardSession,
  isMutationMethod: (method: string) => !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()),
  validateCsrfHeader: (req: NextRequest, expectedToken: string) => req.headers.get("x-aurel-csrf") === expectedToken,
}));

import { authenticateRequest } from "@/lib/auth";

describe("authenticateRequest dashboard session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerClient.mockReturnValue(mocks.db);
  });

  it("authenticates with a valid dashboard session when x-api-key is absent", async () => {
    mocks.validateDashboardSession.mockResolvedValue({
      valid: true,
      workspace_id: "ws_1",
      api_key_id: "key_1",
      role: "viewer",
      csrf_token: "csrf-token",
    });

    const req = new Request("http://localhost/api/logs") as unknown as NextRequest;
    const auth = await authenticateRequest(req);

    expect(auth).toMatchObject({
      db: mocks.db,
      workspace_id: "ws_1",
      api_key_id: "key_1",
      role: "viewer",
    });
    expect(mocks.validateDashboardSession).toHaveBeenCalledWith(req, mocks.db);
  });

  it("rejects cookie-authenticated mutations without a matching CSRF token", async () => {
    mocks.validateDashboardSession.mockResolvedValue({
      valid: true,
      workspace_id: "ws_1",
      api_key_id: "key_1",
      role: "operator",
      csrf_token: "csrf-token",
    });

    const auth = await authenticateRequest(new Request("http://localhost/api/logs/review", { method: "PATCH" }) as unknown as NextRequest);

    expect(auth).toBeInstanceOf(Response);
    expect((auth as Response).status).toBe(403);
    expect(await (auth as Response).json()).toMatchObject({ error: "Missing or invalid CSRF token" });
  });

  it("allows cookie-authenticated mutations with a matching CSRF token", async () => {
    mocks.validateDashboardSession.mockResolvedValue({
      valid: true,
      workspace_id: "ws_1",
      api_key_id: "key_1",
      role: "operator",
      csrf_token: "csrf-token",
    });

    const req = new Request("http://localhost/api/logs/review", {
      method: "PATCH",
      headers: { "x-aurel-csrf": "csrf-token" },
    }) as unknown as NextRequest;
    const auth = await authenticateRequest(req);

    expect(auth).toMatchObject({
      db: mocks.db,
      workspace_id: "ws_1",
      api_key_id: "key_1",
      role: "operator",
    });
  });

  it("returns 401 when neither API key nor valid session is present", async () => {
    mocks.validateDashboardSession.mockResolvedValue({
      valid: false,
      error: "Missing x-api-key header",
    });

    const auth = await authenticateRequest(new Request("http://localhost/api/logs") as unknown as NextRequest);

    expect(auth).toBeInstanceOf(Response);
    expect((auth as Response).status).toBe(401);
    expect(await (auth as Response).json()).toMatchObject({ error: "Missing x-api-key header" });
  });
});
