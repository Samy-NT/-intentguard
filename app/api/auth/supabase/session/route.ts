import { type NextRequest } from "next/server";
import { z } from "zod";
import { createDashboardSession, sessionCookieHeader } from "@/lib/dashboard-session";
import { checkLoginRateLimit } from "@/lib/ratelimit";
import { createServerClient } from "@/lib/supabase/server";
import type { ApiKeyRole } from "@/types";
import { readBoundedJsonBody } from "@/lib/http/body";
import { trustedClientIdentity } from "@/lib/request-identity";

export const runtime = "nodejs";

const SessionExchangeSchema = z.object({
  workspace_id: z.string().uuid().optional(),
});

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization")?.trim();
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function loginRateLimitIdentifier(req: NextRequest): string {
  return trustedClientIdentity(req);
}

function isApiKeyRole(value: unknown): value is ApiKeyRole {
  return value === "admin" || value === "operator" || value === "viewer";
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

  const token = bearerToken(req);
  if (!token) return Response.json({ error: "Missing Supabase bearer token" }, { status: 401 });

  const parsedBody = await readBoundedJsonBody(req, 4_000);
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody.body;
  const parsed = SessionExchangeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join(", ") }, { status: 422 });
  }

  const db = createServerClient();
  const { data: userData, error: userError } = await db.auth.getUser(token);
  const userId = userData.user?.id;
  if (userError || !userId) return Response.json({ error: "Invalid Supabase session" }, { status: 401 });

  let query = db
    .from("workspace_members")
    .select("workspace_id, user_id, role, is_active")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (parsed.data.workspace_id) query = query.eq("workspace_id", parsed.data.workspace_id);

  const { data: member, error: memberError } = await query
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberError || !member || member.user_id !== userId || !isApiKeyRole(member.role)) {
    return Response.json({ error: "No active workspace membership" }, { status: 403 });
  }

  try {
    const session = await createDashboardSession({
      workspace_id: member.workspace_id,
      supabase_user_id: userId,
      role: member.role,
    });
    return Response.json(
      {
        success: true,
        workspace_id: member.workspace_id,
        role: member.role,
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
