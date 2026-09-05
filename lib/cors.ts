import type { NextRequest } from "next/server";

export const CORS_ALLOWED_METHODS = "GET,POST,PATCH,DELETE,OPTIONS";
export const CORS_ALLOWED_HEADERS = "Content-Type, x-api-key, x-aurel-csrf, Authorization, Idempotency-Key, X-Request-ID";

export type CorsDecision =
  | { allowed: true; origin: string | null }
  | { allowed: false; origin: string; reason: string };

export function parseAllowedOrigins(value = process.env.ALLOWED_ORIGINS): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function evaluateCorsOrigin(origin: string | null, allowedOrigins = parseAllowedOrigins()): CorsDecision {
  if (!origin) return { allowed: true, origin: null };
  // Browser credentials must never be exposed to an arbitrary origin in production.
  // Server-to-server callers normally omit Origin and remain unaffected.
  if (allowedOrigins.length === 0) {
    if (process.env.NODE_ENV === "production") {
      return { allowed: false, origin, reason: "ALLOWED_ORIGINS is not configured" };
    }
    return { allowed: true, origin };
  }
  if (allowedOrigins.includes(origin)) return { allowed: true, origin };
  return { allowed: false, origin, reason: "Origin is not allowed" };
}

export function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS,
    "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS,
    "Access-Control-Max-Age": "600",
    "Access-Control-Expose-Headers": "X-Request-ID, X-IntentGuard-Version",
    Vary: "Origin",
  };

  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

export function corsDecisionForRequest(req: NextRequest): CorsDecision {
  const origin = req.headers.get("origin");
  const allowedOrigins = parseAllowedOrigins();

  // Same-origin browser requests are safe even when the optional external
  // client allowlist has not been configured yet. Keep the explicit
  // ALLOWED_ORIGINS requirement for cross-origin clients and readiness checks.
  if (origin && allowedOrigins.length === 0) {
    const requestOrigin = new URL(req.url).origin;
    const configuredSiteOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
    if (origin === requestOrigin || (configuredSiteOrigin && origin === configuredSiteOrigin)) {
      return { allowed: true, origin };
    }
  }

  return evaluateCorsOrigin(origin, allowedOrigins);
}
