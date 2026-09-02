import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from "@/lib/security-headers";

describe("security headers", () => {
  it("defines browser hardening headers for every route", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);

    const rules = await nextConfig.headers?.();
    expect(rules?.[0]?.source).toBe("/:path*");
    const headers = new Map(rules?.[0]?.headers.map((header) => [header.key, header.value]));

    for (const header of SECURITY_HEADERS) {
      expect(headers.get(header.key)).toBe(header.value);
    }
  });

  it("uses a CSP that denies frames, objects, and broad network access", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self' https://*.supabase.co https://api.anthropic.com https://*.sentry.io");
  });
});
