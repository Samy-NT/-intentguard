import type { NextRequest } from "next/server";

export const CORS_ALLOWED_METHODS = "GET,POST,PATCH,DELETE,OPTIONS";
export const CORS_ALLOWED_HEADERS = "Content-Type, x-api-key, x-aurel-csrf, Authorization, Idempotency-Key";

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
  if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return { allowed: true, origin };
  return { allowed: false, origin, reason: "Origin is not allowed" };
}

export function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS,
    "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS,
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };

  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

export function corsDecisionForRequest(req: NextRequest): CorsDecision {
  return evaluateCorsOrigin(req.headers.get("origin"));
}
