import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { ApiKeyRole, DbApiKey } from "@/types";
import { createServerClient } from "@/lib/supabase/server";
import { err } from "@/lib/respond";
import { withTimeout } from "@/lib/timeout";
import { isMutationMethod, validateCsrfHeader, validateDashboardSession } from "@/lib/dashboard-session";

export async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacSha256(secret: string, text: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(text));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashApiKey(rawKey: string): Promise<string> {
  const legacyHash = await sha256(rawKey);
  const secret = process.env.INTENTGUARD_SECRET;
  return secret ? await hmacSha256(secret, rawKey) : legacyHash;
}

export interface AuthResult {
  valid: boolean;
  workspace_id?: string;
  api_key_id?: string;
  role?: ApiKeyRole;
  error?: string;
}

export interface AuthenticatedRequest {
  db: SupabaseClient;
  workspace_id: string;
  api_key_id?: string;
  supabase_user_id?: string;
  role: ApiKeyRole;
}

const ROLE_RANK: Record<ApiKeyRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

/** Validates the raw API key from the request header against hashed DB entries */
export async function validateApiKey(
  rawKey: string,
  db: SupabaseClient
): Promise<AuthResult> {
  const legacyHash = await sha256(rawKey);
  const hash = await hashApiKey(rawKey);

  const hashes = hash === legacyHash ? [hash] : [hash, legacyHash];

  const { data, error } = await db
    .from("api_keys")
    .select("id, workspace_id, is_active, role")
    .in("key_hash", hashes)
    .maybeSingle<Pick<DbApiKey, "id" | "workspace_id" | "is_active" | "role">>();

  if (error) {
    console.error("[auth] DB error looking up API key:", error.message);
    return { valid: false, error: "Invalid API key" };
  }

  if (!data) {
    return { valid: false, error: "Invalid API key" };
  }

  if (!data.is_active) {
    return { valid: false, error: "API key is revoked" };
  }

  db.from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(({ error }) => {
      if (error) console.error("[auth] Failed to update API key last_used_at:", error.message);
    });

  return { valid: true, workspace_id: data.workspace_id, api_key_id: data.id, role: data.role ?? "admin" };
}

export async function authenticateRequest(
  req: NextRequest
): Promise<AuthenticatedRequest | Response> {
  const rawKey = req.headers.get("x-api-key");

  const db = createServerClient();
  if (!rawKey) {
    const session = await validateDashboardSession(req, db);
    if (!session.valid) return err(session.error, 401);
    if (isMutationMethod(req.method) && !validateCsrfHeader(req, session.csrf_token)) {
      return err("Missing or invalid CSRF token", 403);
    }
    return {
      db,
      workspace_id: session.workspace_id,
      api_key_id: session.api_key_id,
      supabase_user_id: session.supabase_user_id,
      role: session.role,
    };
  }

  let auth: AuthResult;
  try {
    auth = await withTimeout(validateApiKey(rawKey, db), 5_000, "auth-lookup");
  } catch (e) {
    console.error("[auth] Auth timeout:", e);
    return err("Authentication service unavailable", 503);
  }

  if (!auth.valid || !auth.workspace_id) {
    return err(auth.error ?? "Unauthorized", 401);
  }

  return { db, workspace_id: auth.workspace_id, api_key_id: auth.api_key_id!, role: auth.role ?? "admin" };
}

export function requireRole(
  auth: AuthenticatedRequest,
  minimumRole: ApiKeyRole
): Response | null {
  if (ROLE_RANK[auth.role] < ROLE_RANK[minimumRole]) {
    return err(`Requires ${minimumRole} role`, 403);
  }
  return null;
}
