import { err } from "@/lib/respond";
import type { NextRequest } from "next/server";

export interface ParsedJsonBody {
  body: unknown;
}

export async function readBoundedJsonBody(
  req: NextRequest,
  maxBytes: number
): Promise<ParsedJsonBody | Response> {
  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const declaredLength = Number(contentLength);
    if (!Number.isFinite(declaredLength) || declaredLength < 0) {
      return err("Invalid content-length", 400);
    }
    if (declaredLength > maxBytes) {
      return err("Request body too large", 413);
    }
  }

  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return err("Unable to read request body", 400);
  }

  if (new TextEncoder().encode(raw).length > maxBytes) {
    return err("Request body too large", 413);
  }

  try {
    return { body: JSON.parse(raw) };
  } catch {
    return err("Invalid JSON body", 400);
  }
}
