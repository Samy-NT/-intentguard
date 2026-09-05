import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createBrowserClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: mocks.createBrowserClient,
}));

const saved = { ...process.env };

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  for (const key of Object.keys(process.env)) {
    if (!(key in saved)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(saved)) process.env[key] = value;
});

describe("Supabase browser client", () => {
  it("prefers the publishable key for first-party dashboard auth", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_123";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy_anon";

    const { createBrowserSupabaseClient } = await import("@/lib/supabase/browser");
    createBrowserSupabaseClient();

    expect(mocks.createBrowserClient).toHaveBeenCalledWith("https://example.supabase.co", "sb_publishable_123");
  });

  it("falls back to the legacy anon key for existing deployments", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy_anon";

    const { createBrowserSupabaseClient } = await import("@/lib/supabase/browser");
    createBrowserSupabaseClient();

    expect(mocks.createBrowserClient).toHaveBeenCalledWith("https://example.supabase.co", "legacy_anon");
  });
});
