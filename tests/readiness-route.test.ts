import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  buildReadinessReport: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/readiness", () => ({
  buildReadinessReport: mocks.buildReadinessReport,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: mocks.createServerClient,
}));

import { GET } from "@/app/api/readiness/route";

const ENV_KEYS = ["NODE_ENV", "CRON_SECRET"] as const;

function mutableEnv(): Record<string, string | undefined> {
  return process.env as Record<string, string | undefined>;
}

function request(auth?: string): NextRequest {
  return new Request("http://localhost/api/readiness", {
    headers: auth ? { authorization: auth } : undefined,
  }) as unknown as NextRequest;
}

describe("readiness route", () => {
  let previousEnv: Record<(typeof ENV_KEYS)[number], string | undefined>;

  beforeEach(() => {
    const env = mutableEnv();
    previousEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, env[key]])) as typeof previousEnv;
    env.NODE_ENV = "production";
    delete process.env.CRON_SECRET;
    vi.clearAllMocks();
    mocks.buildReadinessReport.mockResolvedValue({
      status: "ok",
      generated_at: "2026-09-01T00:00:00.000Z",
      checks: [],
    });
  });

  afterEach(() => {
    const env = mutableEnv();
    for (const key of ENV_KEYS) {
      const value = previousEnv[key];
      if (value === undefined) {
        delete env[key];
      } else {
        env[key] = value;
      }
    }
  });

  it("refuses production readiness checks when CRON_SECRET is missing", async () => {
    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "Readiness is not configured" });
    expect(mocks.buildReadinessReport).not.toHaveBeenCalled();
  });

  it("requires the production readiness bearer token", async () => {
    process.env.CRON_SECRET = "readiness-secret";

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "Unauthorized" });
    expect(mocks.buildReadinessReport).not.toHaveBeenCalled();
  });

  it("runs readiness checks when the production bearer token matches", async () => {
    process.env.CRON_SECRET = "readiness-secret";

    const response = await GET(request("Bearer readiness-secret"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
    expect(mocks.buildReadinessReport).toHaveBeenCalledWith(mocks.createServerClient);
  });
});
