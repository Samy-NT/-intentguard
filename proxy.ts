import { NextResponse, type NextRequest } from "next/server";
import { corsDecisionForRequest, corsHeaders } from "@/lib/cors";

export function proxy(req: NextRequest) {
  const cors = corsDecisionForRequest(req);

  if (!cors.allowed) {
    return NextResponse.json({ error: cors.reason }, { status: 403, headers: corsHeaders(null) });
  }

  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(cors.origin),
    });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(corsHeaders(cors.origin))) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
