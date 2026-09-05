import { describe, expect, it } from "vitest";
import { checkLoginRateLimit } from "@/lib/ratelimit";

describe("rate limits", () => {
  it("limits repeated dashboard login attempts per identifier", async () => {
    const id = `login-test-${crypto.randomUUID()}`;

    expect((await checkLoginRateLimit(id, 2, 60_000)).allowed).toBe(true);
    expect((await checkLoginRateLimit(id, 2, 60_000)).allowed).toBe(true);

    const blocked = await checkLoginRateLimit(id, 2, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetAt).toBeGreaterThan(Date.now());
  });

  it("fails closed in production when distributed Redis is unavailable", async () => {
    const env = process.env as Record<string, string | undefined>;
    const previous = env.NODE_ENV;
    const previousUrl = env.UPSTASH_REDIS_REST_URL;
    const previousToken = env.UPSTASH_REDIS_REST_TOKEN;
    env.NODE_ENV = "production";
    delete env.UPSTASH_REDIS_REST_URL;
    delete env.UPSTASH_REDIS_REST_TOKEN;
    try {
      const result = await checkLoginRateLimit(`production-no-redis-${crypto.randomUUID()}`);
      expect(result).toMatchObject({ allowed: false, remaining: 0 });
      expect(result.resetAt).toBeGreaterThan(Date.now());
    } finally {
      if (previous === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = previous;
      if (previousUrl === undefined) delete env.UPSTASH_REDIS_REST_URL;
      else env.UPSTASH_REDIS_REST_URL = previousUrl;
      if (previousToken === undefined) delete env.UPSTASH_REDIS_REST_TOKEN;
      else env.UPSTASH_REDIS_REST_TOKEN = previousToken;
    }
  });
});
