import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { corsHeaders, evaluateCorsOrigin, parseAllowedOrigins } from "@/lib/cors";
import { proxy } from "@/proxy";

describe("api cors", () => {
  it("parses configured origins", () => {
    expect(parseAllowedOrigins("https://a.example.com, https://b.example.com ,,")).toEqual([
      "https://a.example.com",
      "https://b.example.com",
    ]);
  });

  it("allows server-to-server requests and configured browser origins", () => {
    expect(evaluateCorsOrigin(null, ["https://agent.example.com"])).toEqual({ allowed: true, origin: null });
    expect(evaluateCorsOrigin("https://agent.example.com", ["https://agent.example.com"])).toEqual({
      allowed: true,
      origin: "https://agent.example.com",
    });
  });

  it("rejects unconfigured browser origins when an allowlist is set", () => {
    expect(evaluateCorsOrigin("https://evil.example.com", ["https://agent.example.com"])).toMatchObject({
      allowed: false,
      origin: "https://evil.example.com",
    });
  });

  it("denies arbitrary credentialed browser origins in production when no allowlist is configured", () => {
    const env = process.env as Record<string, string | undefined>;
    const previous = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      expect(evaluateCorsOrigin("https://evil.example.com", [])).toMatchObject({
        allowed: false,
        reason: "ALLOWED_ORIGINS is not configured",
      });
    } finally {
      if (previous === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = previous;
    }
  });

  it("builds preflight headers for API key, csrf, authorization, and idempotency headers", () => {
    const headers = new Headers(corsHeaders("https://agent.example.com"));

    expect(headers.get("Access-Control-Allow-Origin")).toBe("https://agent.example.com");
    expect(headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(headers.get("Access-Control-Allow-Headers")).toContain("x-api-key");
    expect(headers.get("Access-Control-Allow-Headers")).toContain("x-aurel-csrf");
    expect(headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect(headers.get("Access-Control-Allow-Headers")).toContain("Idempotency-Key");
  });

  it("responds to API preflight requests from allowed origins", async () => {
    const previous = process.env.ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = "https://agent.example.com";
    try {
      const response = proxy(
        new NextRequest("http://localhost/api/v1/verify", {
          method: "OPTIONS",
          headers: { origin: "https://agent.example.com" },
        })
      );

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://agent.example.com");
      expect(response.headers.get("X-Request-ID")).toMatch(/^[a-f0-9-]{36}$/);
    } finally {
      if (previous === undefined) delete process.env.ALLOWED_ORIGINS;
      else process.env.ALLOWED_ORIGINS = previous;
    }
  });

  it("preserves a valid request id and replaces unsafe values", () => {
    const preserved = proxy(new NextRequest("http://localhost/api/health", { headers: { "x-request-id": "trace_123" } }));
    expect(preserved.headers.get("X-Request-ID")).toBe("trace_123");

    const replaced = proxy(new NextRequest("http://localhost/api/health", { headers: { "x-request-id": "bad id" } }));
    expect(replaced.headers.get("X-Request-ID")).toMatch(/^[a-f0-9-]{36}$/);
  });
});
