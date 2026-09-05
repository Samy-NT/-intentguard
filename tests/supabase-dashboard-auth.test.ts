import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createBrowserSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: mocks.createBrowserSupabaseClient,
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("Supabase dashboard auth client flow", () => {
  it("requests a magic link with the dashboard callback URL", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    mocks.createBrowserSupabaseClient.mockReturnValue({ auth: { signInWithOtp } });

    const { requestSupabaseDashboardMagicLink } = await import("@/lib/supabase/dashboard-auth");
    await expect(requestSupabaseDashboardMagicLink("ops@example.com", "https://app.example.com/auth/callback")).resolves.toEqual({ ok: true });

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "ops@example.com",
      options: { emailRedirectTo: "https://app.example.com/auth/callback" },
    });
  });

  it("exchanges a completed Supabase browser session for a dashboard session", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: "jwt_1" } }, error: null });
    mocks.createBrowserSupabaseClient.mockReturnValue({ auth: { exchangeCodeForSession, getSession } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      success: true,
      workspace_id: "ws_1",
      role: "admin",
      csrf_token: "csrf-token",
    }), { status: 200 }));

    const { completeSupabaseDashboardAuth } = await import("@/lib/supabase/dashboard-auth");
    await expect(completeSupabaseDashboardAuth("https://app.example.com/auth/callback?code=abc")).resolves.toMatchObject({
      success: true,
      csrf_token: "csrf-token",
    });

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(fetch).toHaveBeenCalledWith("/api/auth/supabase/session", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer jwt_1" }),
    }));
  });
});
