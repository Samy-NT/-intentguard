import { NextResponse } from "next/server";

export const API_VERSION = "1.0.0";
const VERSION_HEADER = "X-IntentGuard-Version";

function withVersionHeader(res: NextResponse): NextResponse {
  res.headers.set(VERSION_HEADER, API_VERSION);
  return res;
}

export function json<T>(data: T, status = 200) {
  return withVersionHeader(NextResponse.json(data, { status }));
}

export function err(message: string, status: number) {
  return withVersionHeader(NextResponse.json({ error: message }, { status }));
}
