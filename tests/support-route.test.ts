import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  checkSupportRateLimit: vi.fn(),
  fireWebhook: vi.fn(),
}));

vi.mock("@/lib/ratelimit", () => ({
  checkSupportRateLimit: mocks.checkSupportRateLimit,
}));

vi.mock("@/lib/webhooks/notify", () => ({
  fireWebhook: mocks.fireWebhook,
}));

import { POST } from "@/app/api/support/route";

const ENV_KEYS = ["SUPPORT_WEBHOOK_URL", "SUPPORT_WEBHOOK_SECRET"] as const;

function request(body: unknown): NextRequest {
  return new Request("http://localhost/api/support", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "203.0.113.10",
      "user-agent": "vitest",
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("support route", () => {
  let previousEnv: Record<(typeof ENV_KEYS)[number], string | undefined>;

  beforeEach(() => {
    vi.clearAllMocks();
    previousEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as typeof previousEnv;
    process.env.SUPPORT_WEBHOOK_URL = "https://support.example.com/aurel";
    process.env.SUPPORT_WEBHOOK_SECRET = "support-secret";
    mocks.checkSupportRateLimit.mockResolvedValue({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 });
    mocks.fireWebhook.mockResolvedValue({ status: "delivered", http_status: 202 });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = previousEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("delivers validated support requests to the configured webhook", async () => {
    const response = await POST(request({
      email: "ops@example.com",
      category: "incident",
      severity: "urgent",
      subject: "Webhook retries failing",
      message: "The webhook queue has terminal failures for the pilot workspace.",
      workspace_id: "workspace_1",
    }));

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ success: true, status: "submitted" });
    expect(mocks.checkSupportRateLimit).toHaveBeenCalledWith("203.0.113.10");
    expect(mocks.fireWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "support.ticket.created",
        ticket: expect.objectContaining({
          email: "ops@example.com",
          category: "incident",
          severity: "urgent",
          subject: "Webhook retries failing",
        }),
      }),
      {
        url: "https://support.example.com/aurel",
        secret: "support-secret",
        threshold: 0,
      }
    );
  });

  it("fails clearly when support webhook is not configured", async () => {
    delete process.env.SUPPORT_WEBHOOK_URL;

    const response = await POST(request({
      subject: "Need help",
      message: "Please help configure this pilot workspace.",
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "SUPPORT_WEBHOOK_URL is not configured" });
    expect(mocks.fireWebhook).not.toHaveBeenCalled();
  });

  it("rate limits support requests before parsing ticket delivery", async () => {
    mocks.checkSupportRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000 });

    const response = await POST(request({
      subject: "Need help",
      message: "Please help configure this pilot workspace.",
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(await response.json()).toMatchObject({ error: "Too many support requests. Try again later." });
    expect(mocks.fireWebhook).not.toHaveBeenCalled();
  });

  it("rejects invalid support request bodies", async () => {
    const response = await POST(request({ subject: "No" }));

    expect(response.status).toBe(422);
    expect(mocks.fireWebhook).not.toHaveBeenCalled();
  });
});
