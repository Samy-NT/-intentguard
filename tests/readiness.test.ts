import { describe, expect, it, vi } from "vitest";
import { buildEnvReadiness, buildReadinessReport, summarizeReadiness } from "@/lib/readiness";
import type { SupabaseClient } from "@supabase/supabase-js";

function mockDb(errorTables: string[] = []): SupabaseClient {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve({
          error: errorTables.includes(table) ? { message: `${table} missing` } : null,
        })),
      })),
    })),
  } as unknown as SupabaseClient;
}

const STRONG_SECRET = "0123456789abcdef0123456789abcdef";

function validEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: `${STRONG_SECRET}-anon`,
    SUPABASE_SERVICE_ROLE_KEY: `${STRONG_SECRET}.service-role`,
    ANTHROPIC_API_KEY: `sk-ant-api03-${STRONG_SECRET}`,
    INTENTGUARD_SECRET: `${STRONG_SECRET}-pepper`,
    DASHBOARD_SESSION_SECRET: `${STRONG_SECRET}-dashboard`,
    AUDIT_SIGNING_SECRET: `${STRONG_SECRET}-audit`,
    MANDATE_SIGNING_SECRET: `${STRONG_SECRET}-mandate`,
    CRON_SECRET: `${STRONG_SECRET}-cron`,
    UPSTASH_REDIS_REST_URL: "https://redis.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: `${STRONG_SECRET}-redis`,
    SUPPORT_WEBHOOK_URL: "https://support.example.com/aurel",
    SUPPORT_WEBHOOK_SECRET: `${STRONG_SECRET}-support`,
    ...overrides,
  };
}

describe("readiness", () => {
  it("fails when required environment variables are missing", () => {
    const checks = buildEnvReadiness({});
    expect(checks.filter((check) => check.status === "fail").map((check) => check.name)).toEqual([
      "env.NEXT_PUBLIC_SUPABASE_URL",
      "env.SUPABASE_SERVICE_ROLE_KEY",
      "env.ANTHROPIC_API_KEY",
      "env.NEXT_PUBLIC_SUPABASE_BROWSER_KEY",
    ]);
  });

  it("warns for recommended production secrets without failing env readiness", () => {
    const checks = buildEnvReadiness(validEnv({
      INTENTGUARD_SECRET: undefined,
      DASHBOARD_SESSION_SECRET: undefined,
      AUDIT_SIGNING_SECRET: undefined,
      MANDATE_SIGNING_SECRET: undefined,
      CRON_SECRET: undefined,
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
      SUPPORT_WEBHOOK_URL: undefined,
      SUPPORT_WEBHOOK_SECRET: undefined,
    }));

    expect(summarizeReadiness(checks)).toBe("warn");
    expect(checks.find((check) => check.name === "env.MANDATE_SIGNING_SECRET")?.status).toBe("warn");
  });

  it("fails when configured secrets are placeholders or too short", () => {
    const checks = buildEnvReadiness(validEnv({
      SUPABASE_SERVICE_ROLE_KEY: "your-service-role-key",
      NEXT_PUBLIC_SUPABASE_URL: "https://your-project.supabase.co",
      INTENTGUARD_SECRET: "pepper",
      CRON_SECRET: "your-random-cron-secret",
      AUDIT_SIGNING_PREVIOUS_SECRETS: "old-secret",
      SUPPORT_WEBHOOK_URL: "https://support.acme.test/aurel",
      SUPPORT_WEBHOOK_SECRET: "short-support-key",
    }));

    expect(checks.find((check) => check.name === "env.NEXT_PUBLIC_SUPABASE_URL")).toMatchObject({
      status: "fail",
      detail: "NEXT_PUBLIC_SUPABASE_URL still contains a placeholder value",
    });
    expect(checks.find((check) => check.name === "env.SUPABASE_SERVICE_ROLE_KEY")).toMatchObject({
      status: "fail",
      detail: "SUPABASE_SERVICE_ROLE_KEY still contains a placeholder value",
    });
    expect(checks.find((check) => check.name === "env.INTENTGUARD_SECRET")).toMatchObject({
      status: "fail",
      detail: "INTENTGUARD_SECRET still contains a placeholder value",
    });
    expect(checks.find((check) => check.name === "env.CRON_SECRET")).toMatchObject({
      status: "fail",
      detail: "CRON_SECRET still contains a placeholder value",
    });
    expect(checks.find((check) => check.name === "env.AUDIT_SIGNING_PREVIOUS_SECRETS")).toMatchObject({
      status: "fail",
      detail: "AUDIT_SIGNING_PREVIOUS_SECRETS entries must be at least 32 characters",
    });
    expect(checks.find((check) => check.name === "env.SUPPORT_WEBHOOK")).toMatchObject({
      status: "fail",
      detail: "SUPPORT_WEBHOOK_SECRET must be at least 32 characters when configured",
    });
  });

  it("fails when URLs are invalid", () => {
    const checks = buildEnvReadiness(validEnv({
      NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      UPSTASH_REDIS_REST_URL: "not-a-url",
      SUPPORT_WEBHOOK_URL: "not-a-url",
    }));

    expect(checks.find((check) => check.name === "env.NEXT_PUBLIC_SUPABASE_URL")).toMatchObject({
      status: "fail",
      detail: "NEXT_PUBLIC_SUPABASE_URL must be a valid HTTP(S) URL",
    });
    expect(checks.find((check) => check.name === "env.UPSTASH_REDIS")).toMatchObject({
      status: "fail",
      detail: "UPSTASH_REDIS_REST_URL must be a valid HTTP(S) URL",
    });
    expect(checks.find((check) => check.name === "env.SUPPORT_WEBHOOK")).toMatchObject({
      status: "fail",
      detail: "SUPPORT_WEBHOOK_URL must be a valid HTTP(S) URL",
    });
  });

  it("fails when support webhook URL does not use HTTPS", () => {
    const checks = buildEnvReadiness(validEnv({
      SUPPORT_WEBHOOK_URL: "http://support.acme.test/aurel",
    }));

    expect(checks.find((check) => check.name === "env.SUPPORT_WEBHOOK")).toMatchObject({
      status: "fail",
      detail: "SUPPORT_WEBHOOK_URL must use HTTPS",
    });
  });

  it("fails production readiness when browser origins are not explicitly allowlisted", () => {
    const checks = buildEnvReadiness({
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: STRONG_SECRET,
      SUPABASE_SERVICE_ROLE_KEY: `${STRONG_SECRET}.service-role`,
      ANTHROPIC_API_KEY: `${STRONG_SECRET}.anthropic`,
    });
    expect(checks.find((check) => check.name === "env.ALLOWED_ORIGINS")).toMatchObject({
      status: "fail",
    });
  });

  it("accepts the current Supabase publishable key for browser auth", () => {
    const checks = buildEnvReadiness(validEnv({
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `${STRONG_SECRET}-publishable`,
    }));

    expect(checks.find((check) => check.name === "env.NEXT_PUBLIC_SUPABASE_BROWSER_KEY")).toMatchObject({
      status: "pass",
    });
    expect(checks.find((check) => check.name === "env.NEXT_PUBLIC_SUPABASE_ANON_KEY")).toBeUndefined();
  });

  it("requires dedicated secrets and distributed rate limiting in production", () => {
    const checks = buildEnvReadiness({
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: STRONG_SECRET,
      SUPABASE_SERVICE_ROLE_KEY: `${STRONG_SECRET}.service-role`,
      ANTHROPIC_API_KEY: `${STRONG_SECRET}.anthropic`,
      ALLOWED_ORIGINS: "https://dashboard.example.com",
    });

    expect(checks.find((check) => check.name === "env.DASHBOARD_SESSION_SECRET")).toMatchObject({ status: "fail" });
    expect(checks.find((check) => check.name === "env.AUDIT_SIGNING_SECRET")).toMatchObject({ status: "fail" });
    expect(checks.find((check) => check.name === "env.MANDATE_SIGNING_SECRET")).toMatchObject({ status: "fail" });
    expect(checks.find((check) => check.name === "env.CRON_SECRET")).toMatchObject({ status: "fail" });
    expect(checks.find((check) => check.name === "env.UPSTASH_REDIS")).toMatchObject({ status: "fail" });
  });

  it("checks required database tables when env is present", async () => {
    const report = await buildReadinessReport(() => mockDb(["mandates"]), validEnv());

    expect(report.status).toBe("fail");
    expect(report.checks.find((check) => check.name === "db.mandates")).toMatchObject({
      status: "fail",
      detail: "mandates missing",
    });
    expect(report.checks.find((check) => check.name === "db.workspace_members")).toBeTruthy();
  });

  it("requires a complete Stripe configuration when self-serve billing is enabled", () => {
    const checks = buildEnvReadiness(validEnv({
      BILLING_PROVIDER: "stripe",
      BILLING_APP_URL: "http://billing.example.com",
      STRIPE_SECRET_KEY: "short",
      STRIPE_WEBHOOK_SECRET: "short",
      STRIPE_PRICE_STARTER: "price_starter",
      STRIPE_PRICE_PILOT: "price_pilot",
      STRIPE_PRICE_ENTERPRISE: "price_enterprise",
      STRIPE_PLAN_LIMITS: JSON.stringify({ starter: 1000, pilot: 10000, enterprise: null }),
    }));
    expect(checks.find((check) => check.name === "env.STRIPE_SECRET_KEY")).toMatchObject({ status: "fail" });
    expect(checks.find((check) => check.name === "env.STRIPE_WEBHOOK_SECRET")).toMatchObject({ status: "fail" });
    expect(checks.find((check) => check.name === "env.BILLING_APP_URL")).toMatchObject({ status: "pass" });
  });
});
