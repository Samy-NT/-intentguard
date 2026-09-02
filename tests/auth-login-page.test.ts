import { beforeEach, describe, expect, it, vi } from "vitest";
import { DASHBOARD_SESSION_COOKIE } from "@/lib/dashboard-session";

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  createServerClient: vi.fn(),
  validateDashboardSessionToken: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (name === DASHBOARD_SESSION_COOKIE && mocks.cookieValue ? { value: mocks.cookieValue } : undefined),
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/dashboard-session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dashboard-session")>("@/lib/dashboard-session");
  return {
    ...actual,
    validateDashboardSessionToken: mocks.validateDashboardSessionToken,
  };
});

import LoginPage from "@/app/auth/login/page";
import { LoginForm } from "@/app/auth/login/LoginForm";

describe("login page session redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieValue = undefined;
    mocks.createServerClient.mockReturnValue({ from: vi.fn() });
    mocks.validateDashboardSessionToken.mockResolvedValue({ valid: false, error: "Invalid dashboard session" });
  });

  it("renders the login form without a dashboard session cookie", async () => {
    const result = await LoginPage();

    expect(result).toMatchObject({ type: LoginForm });
    expect(mocks.validateDashboardSessionToken).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects an already connected user to the dashboard", async () => {
    mocks.cookieValue = "signed-session";
    mocks.validateDashboardSessionToken.mockResolvedValue({
      valid: true,
      workspace_id: "ws_1",
      api_key_id: "key_1",
      role: "admin",
      csrf_token: "csrf-token",
    });

    await expect(LoginPage()).rejects.toThrow("REDIRECT:/dashboard");
    expect(mocks.validateDashboardSessionToken).toHaveBeenCalledWith("signed-session", expect.anything());
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });
});
