import { NextResponse, type NextRequest } from "next/server";
import { corsDecisionForRequest, corsHeaders } from "@/lib/cors";

export function proxy(req: NextRequest) {
  const cors = corsDecisionForRequest(req);
  const requestId = requestIdFor(req);

  if (!cors.allowed) {
    const response = NextResponse.json({ error: cors.reason }, { status: 403, headers: corsHeaders(null) });
    response.headers.set("X-Request-ID", requestId);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  if (req.method === "OPTIONS") {
    const response = new NextResponse(null, {
      status: 204,
      headers: corsHeaders(cors.origin),
    });
    response.headers.set("X-Request-ID", requestId);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(corsHeaders(cors.origin))) {
    response.headers.set(key, value);
  }
  response.headers.set("X-Request-ID", requestId);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function requestIdFor(req: NextRequest): string {
  const supplied = req.headers.get("x-request-id")?.trim();
  return supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied) ? supplied : crypto.randomUUID();
}

export const config = {
  matcher: "/api/:path*",
};
