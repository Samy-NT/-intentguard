import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import {
  DASHBOARD_SESSION_COOKIE,
  clearSessionCookieHeader,
  createDashboardSession,
  sessionCookieHeader,
  validateDashboardSession,
  validateDashboardSessionToken,
} from "@/lib/dashboard-session";

function mockSessionDb(active = true): SupabaseClient {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() =>
      Promise.resolve({
        data: active
          ? { id: "key_1", workspace_id: "ws_1", is_active: true, role: "operator" }
          : { id: "key_1", workspace_id: "ws_1", is_active: false, role: "operator" },
        error: null,
      })
    ),
  };

  return {
    from: vi.fn(() => query),
  } as unknown as SupabaseClient;
}

function mockMemberSessionDb(active = true): SupabaseClient {
  const memberQuery = {
    select: vi.fn(() => memberQuery),
    eq: vi.fn(() => memberQuery),
    maybeSingle: vi.fn(() =>
      Promise.resolve({
        data: active
          ? { user_id: "user_1", workspace_id: "ws_1", is_active: true, role: "admin" }
          : { user_id: "user_1", workspace_id: "ws_1", is_active: false, role: "admin" },
        error: null,
      })
    ),
  };

  return {
    from: vi.fn(() => memberQuery),
  } as unknown as SupabaseClient;
}

function requestWithCookie(token: string): NextRequest {
  return {
    cookies: {
      get: vi.fn((name: string) => (name === DASHBOARD_SESSION_COOKIE ? { value: token } : undefined)),
    },
  } as unknown as NextRequest;
}

describe("dashboard session", () => {
  const previousSecret = process.env.DASHBOARD_SESSION_SECRET;

  beforeEach(() => {
    process.env.DASHBOARD_SESSION_SECRET = "session-secret";
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.DASHBOARD_SESSION_SECRET;
    else process.env.DASHBOARD_SESSION_SECRET = previousSecret;
  });

  it("creates an httpOnly SameSite session cookie", async () => {
    const session = await createDashboardSession({
      workspace_id: "ws_1",
      api_key_id: "key_1",
      role: "operator",
      now: new Date("2026-09-01T00:00:00.000Z"),
    });

    const header = sessionCookieHeader(session.token, session.expires_at);

    expect(session.csrf_token).toMatch(/^[0-9a-f-]{36}$/);
    expect(header).toContain(`${DASHBOARD_SESSION_COOKIE}=`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
  });

  it("does not fall back to shared secrets in production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousIntentSecret = process.env.INTENTGUARD_SECRET;
    delete process.env.DASHBOARD_SESSION_SECRET;
    process.env.INTENTGUARD_SECRET = "shared-secret-that-must-not-sign-dashboard-cookies";
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    try {
      await expect(createDashboardSession({ workspace_id: "ws_1", api_key_id: "key_1", role: "operator" })).rejects.toThrow();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = previousNodeEnv;
      if (previousIntentSecret === undefined) delete process.env.INTENTGUARD_SECRET;
      else process.env.INTENTGUARD_SECRET = previousIntentSecret;
    }
  });

  it("validates a signed session against an active API key", async () => {
    const session = await createDashboardSession({
      workspace_id: "ws_1",
      api_key_id: "key_1",
      role: "operator",
      now: new Date("2026-09-01T00:00:00.000Z"),
    });

    const result = await validateDashboardSession(
      requestWithCookie(session.token),
      mockSessionDb(true),
      new Date("2026-09-01T01:00:00.000Z")
    );

    expect(result).toMatchObject({
      valid: true,
      workspace_id: "ws_1",
      api_key_id: "key_1",
      role: "operator",
      csrf_token: session.csrf_token,
    });
  });

  it("validates a raw session token for server-side dashboard guards", async () => {
    const session = await createDashboardSession({
      workspace_id: "ws_1",
      api_key_id: "key_1",
      role: "operator",
      now: new Date("2026-09-01T00:00:00.000Z"),
    });

    const result = await validateDashboardSessionToken(
      session.token,
      mockSessionDb(true),
      new Date("2026-09-01T01:00:00.000Z")
    );

    expect(result).toMatchObject({
      valid: true,
      workspace_id: "ws_1",
      api_key_id: "key_1",
      role: "operator",
      csrf_token: session.csrf_token,
    });
  });

  it("validates a signed session against an active Supabase Auth workspace member", async () => {
    const session = await createDashboardSession({
      workspace_id: "ws_1",
      supabase_user_id: "user_1",
      role: "admin",
      now: new Date("2026-09-01T00:00:00.000Z"),
    } as Parameters<typeof createDashboardSession>[0]);

    const db = mockMemberSessionDb(true);
    const result = await validateDashboardSession(
      requestWithCookie(session.token),
      db,
      new Date("2026-09-01T01:00:00.000Z")
    );

    expect(result).toMatchObject({
      valid: true,
      workspace_id: "ws_1",
      supabase_user_id: "user_1",
      role: "admin",
      csrf_token: session.csrf_token,
    });
    expect(db.from).toHaveBeenCalledWith("workspace_members");
  });

  it("rejects expired sessions and revoked backing keys", async () => {
    const session = await createDashboardSession({
      workspace_id: "ws_1",
      api_key_id: "key_1",
      role: "operator",
      now: new Date("2026-09-01T00:00:00.000Z"),
    });

    const expired = await validateDashboardSession(
      requestWithCookie(session.token),
      mockSessionDb(true),
      new Date("2026-09-02T00:00:00.000Z")
    );
    const revoked = await validateDashboardSession(
      requestWithCookie(session.token),
      mockSessionDb(false),
      new Date("2026-09-01T01:00:00.000Z")
    );

    expect(expired).toMatchObject({ valid: false, error: "Dashboard session expired" });
    expect(revoked).toMatchObject({ valid: false, error: "Dashboard session API key is no longer active" });
  });

  it("clears the session cookie", () => {
    expect(clearSessionCookieHeader()).toContain(`${DASHBOARD_SESSION_COOKIE}=;`);
    expect(clearSessionCookieHeader()).toContain("Max-Age=0");
  });
});
