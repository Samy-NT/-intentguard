import { type NextRequest } from "next/server";
import { z } from "zod";
import { validateApiKey } from "@/lib/auth";
import { createDashboardSession, sessionCookieHeader } from "@/lib/dashboard-session";
import { checkLoginRateLimit } from "@/lib/ratelimit";
import { createServerClient } from "@/lib/supabase/server";
import { readBoundedJsonBody } from "@/lib/http/body";
import { trustedClientIdentity } from "@/lib/request-identity";

const LoginSchema = z.object({
  api_key: z.string().min(1),
});

function loginRateLimitIdentifier(req: NextRequest): string {
  return trustedClientIdentity(req);
}

export async function POST(req: NextRequest) {
  const rateLimit = await checkLoginRateLimit(loginRateLimitIdentifier(req));
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many login attempts. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
        },
      }
    );
  }

  const parsedBody = await readBoundedJsonBody(req, 4_000);
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody.body;

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join(", ") }, { status: 422 });
  }

  const db = createServerClient();
  const auth = await validateApiKey(parsed.data.api_key, db);
  if (!auth.valid || !auth.workspace_id || !auth.api_key_id) {
    return Response.json({ error: auth.error ?? "Invalid API key" }, { status: 401 });
  }

  try {
    const session = await createDashboardSession({
      workspace_id: auth.workspace_id,
      api_key_id: auth.api_key_id,
      role: auth.role ?? "admin",
    });
    return Response.json(
      {
        success: true,
        workspace_id: auth.workspace_id,
        role: auth.role ?? "admin",
        expires_at: session.expires_at,
        csrf_token: session.csrf_token,
      },
      {
        headers: {
          "Set-Cookie": sessionCookieHeader(session.token, session.expires_at),
        },
      }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create dashboard session" },
      { status: 500 }
    );
  }
}
