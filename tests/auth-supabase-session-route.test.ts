import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { DASHBOARD_SESSION_COOKIE } from "@/lib/dashboard-session";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  checkLoginRateLimit: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/ratelimit", () => ({
  checkLoginRateLimit: mocks.checkLoginRateLimit,
}));

import { POST } from "@/app/api/auth/supabase/session/route";

function request(token: string, body: unknown = {}): NextRequest {
  return new Request("http://localhost/api/auth/supabase/session", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function supabaseAuthDb(member: Record<string, unknown> | null) {
  const memberQuery = {
    select: vi.fn(() => memberQuery),
    eq: vi.fn(() => memberQuery),
    order: vi.fn(() => memberQuery),
    limit: vi.fn(() => memberQuery),
    maybeSingle: vi.fn().mockResolvedValue({ data: member, error: null }),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user_1", email: "ops@example.com" } }, error: null }),
    },
    from: vi.fn(() => memberQuery),
  };
}

describe("Supabase Auth dashboard session exchange", () => {
  const previousSecret = process.env.DASHBOARD_SESSION_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DASHBOARD_SESSION_SECRET = "session-secret";
    mocks.checkLoginRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: Date.now() + 60_000 });
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previousSecret;
  });

  it("creates a dashboard session for a verified Supabase user with an active workspace membership", async () => {
    const db = supabaseAuthDb({ workspace_id: "ws_1", user_id: "user_1", role: "admin", is_active: true });
    mocks.createServerClient.mockReturnValue(db);

    const response = await POST(request("jwt_1"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      workspace_id: "ws_1",
      role: "admin",
      csrf_token: expect.any(String),
    });
    expect(db.auth.getUser).toHaveBeenCalledWith("jwt_1");
    expect(response.headers.get("Set-Cookie")).toContain(`${DASHBOARD_SESSION_COOKIE}=`);
  });

  it("rejects verified Supabase users without an active workspace membership", async () => {
    const db = supabaseAuthDb(null);
    mocks.createServerClient.mockReturnValue(db);

    const response = await POST(request("jwt_1"));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "No active workspace membership" });
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });
});
