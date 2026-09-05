import type { NextRequest } from "next/server";

/** Return an edge-provided client identity for abuse controls. */
export function trustedClientIdentity(req: NextRequest): string {
  const vercelForwarded = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercelForwarded) return vercelForwarded;
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (req.headers.get("x-vercel-id") && realIp) return realIp;
  // Local/test servers do not have the Vercel edge header. Keep the fallback
  // only outside production so deployed callers cannot spoof this value.
  if (process.env.NODE_ENV !== "production") {
    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
    if (realIp) return realIp;
  }
  return "edge";
}
