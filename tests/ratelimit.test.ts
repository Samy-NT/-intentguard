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
});
