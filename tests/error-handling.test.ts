import { describe, it, expect, vi, afterEach } from "vitest";
import { withTimeout, TimeoutError } from "@/lib/timeout";
import { assertEnv, env } from "@/lib/env";

// ── withTimeout ───────────────────────────────────────────────────────────────

describe("withTimeout", () => {
  it("resolves immediately when promise is fast", async () => {
    const result = await withTimeout(Promise.resolve(42), 1000, "fast-op");
    expect(result).toBe(42);
  });

  it("rejects with timeout message when promise is slow", async () => {
    const slow = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("never")), 500)
    );
    await expect(withTimeout(slow, 10, "slow-op")).rejects.toThrow("[timeout] slow-op exceeded 10ms");
  });

  it("rejects before the promise resolves", async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve("late"), 200));
    await expect(withTimeout(slow, 20, "query")).rejects.toThrow("timeout");
  });
});

describe("TimeoutError", () => {
  it("has name TimeoutError", () => {
    const e = new TimeoutError("db-query", 5000);
    expect(e.name).toBe("TimeoutError");
    expect(e.message).toContain("5000ms");
    expect(e.message).toContain("db-query");
  });
});

// ── assertEnv / env ───────────────────────────────────────────────────────────

describe("assertEnv", () => {
  afterEach(() => {
    // restore any env vars we may have deleted
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });

  it("does not throw when all required vars are present", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(() => assertEnv()).not.toThrow();
  });

  it("throws listing all missing vars", () => {
    const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => assertEnv()).toThrow("NEXT_PUBLIC_SUPABASE_URL");
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
      process.env.ANTHROPIC_API_KEY = savedKey;
    }
  });
});

describe("env()", () => {
  it("returns the value when var is set", () => {
    process.env.TEST_VAR_INTENTGUARD = "hello";
    expect(env("TEST_VAR_INTENTGUARD")).toBe("hello");
    delete process.env.TEST_VAR_INTENTGUARD;
  });

  it("throws when var is missing", () => {
    delete process.env.TEST_VAR_INTENTGUARD;
    expect(() => env("TEST_VAR_INTENTGUARD")).toThrow("Missing env var: TEST_VAR_INTENTGUARD");
  });
});
