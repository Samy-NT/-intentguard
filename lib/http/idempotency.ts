import { err } from "@/lib/respond";
import type { NextRequest } from "next/server";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~:%-]{1,512}$/;

export function validateIdempotencyKeyHeader(req: NextRequest): Response | undefined {
  const key = req.headers.get("idempotency-key");
  if (key === null) return undefined;
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    return err("Invalid idempotency-key header", 400);
  }
  return undefined;
}
