import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { DASHBOARD_SESSION_COOKIE } from "@/lib/dashboard-session";

const mocks = vi.hoisted(() => ({
  db: {},
  createServerClient: vi.fn(),
  validateApiKey: vi.fn(),
  checkLoginRateLimit: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/auth", () => ({
  validateApiKey: mocks.validateApiKey,
}));

vi.mock("@/lib/ratelimit", () => ({
  checkLoginRateLimit: mocks.checkLoginRateLimit,
}));

import { POST } from "@/app/api/auth/login/route";

function loginRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("auth login route", () => {
  const previousSessionSecret = process.env.DASHBOARD_SESSION_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DASHBOARD_SESSION_SECRET = "session-secret";
    mocks.createServerClient.mockReturnValue(mocks.db);
    mocks.checkLoginRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: Date.now() + 60_000 });
    mocks.validateApiKey.mockResolvedValue({
      valid: true,
      workspace_id: "ws_1",
      api_key_id: "key_1",
      role: "operator",
    });
  });

  afterEach(() => {
    if (previousSessionSecret === undefined) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previousSessionSecret;
  });

  it("sets a dashboard session cookie for a valid API key", async () => {
    const response = await POST(loginRequest({ api_key: "ig_live_test" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      workspace_id: "ws_1",
      role: "operator",
      csrf_token: expect.any(String),
    });
    expect(response.headers.get("Set-Cookie")).toContain(`${DASHBOARD_SESSION_COOKIE}=`);
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
  });

  it("rejects invalid API keys without setting a cookie", async () => {
    mocks.validateApiKey.mockResolvedValue({ valid: false, error: "Invalid API key" });

    const response = await POST(loginRequest({ api_key: "bad" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "Invalid API key" });
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("rate limits login attempts before validating the API key", async () => {
    mocks.checkLoginRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 });

    const response = await POST(loginRequest({ api_key: "ig_live_test" }));

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: "Too many login attempts. Try again later." });
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(mocks.validateApiKey).not.toHaveBeenCalled();
  });

  it("fails clearly when no dashboard session secret is configured", async () => {
    delete process.env.DASHBOARD_SESSION_SECRET;
    delete process.env.INTENTGUARD_SECRET;
    delete process.env.AUDIT_SIGNING_SECRET;

    const response = await POST(loginRequest({ api_key: "ig_live_test" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: "DASHBOARD_SESSION_SECRET or INTENTGUARD_SECRET is required",
    });
  });
});
