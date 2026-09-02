import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { ApiKeyRole, DbApiKey } from "@/types";

export const DASHBOARD_SESSION_COOKIE = "aurel_dashboard_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

interface DashboardSessionPayload {
  workspace_id: string;
  api_key_id: string;
  role: ApiKeyRole;
  csrf_token: string;
  expires_at: string;
}

interface DashboardSessionToken {
  payload: DashboardSessionPayload;
  signature: string;
}

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sessionSecret(): string | null {
  return process.env.DASHBOARD_SESSION_SECRET || process.env.INTENTGUARD_SECRET || process.env.AUDIT_SIGNING_SECRET || null;
}

async function hmacSha256(secret: string, text: string): Promise<string> {
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
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

export async function createDashboardSession(input: {
  workspace_id: string;
  api_key_id: string;
  role: ApiKeyRole;
  now?: Date;
}): Promise<{ token: string; expires_at: string; csrf_token: string }> {
  const secret = sessionSecret();
  if (!secret) throw new Error("DASHBOARD_SESSION_SECRET or INTENTGUARD_SECRET is required");

  const now = input.now ?? new Date();
  const expires_at = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
  const payload: DashboardSessionPayload = {
    workspace_id: input.workspace_id,
    api_key_id: input.api_key_id,
    role: input.role,
    csrf_token: crypto.randomUUID(),
    expires_at,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = await hmacSha256(secret, encodedPayload);
  const token: DashboardSessionToken = { payload, signature };
  return { token: base64url(JSON.stringify(token)), expires_at, csrf_token: payload.csrf_token };
}

export function sessionCookieHeader(token: string, expiresAt: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${DASHBOARD_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${secure}`;
}

export function clearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${DASHBOARD_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function parseToken(raw: string): DashboardSessionToken | null {
  try {
    const token = JSON.parse(fromBase64url(raw)) as Partial<DashboardSessionToken>;
    if (!token.payload || typeof token.signature !== "string") return null;
    const payload = token.payload as Partial<DashboardSessionPayload>;
    if (
      typeof payload.workspace_id !== "string" ||
      typeof payload.api_key_id !== "string" ||
      (payload.role !== "admin" && payload.role !== "operator" && payload.role !== "viewer") ||
      typeof payload.csrf_token !== "string" ||
      typeof payload.expires_at !== "string"
    ) {
      return null;
    }
    return {
      payload: {
        workspace_id: payload.workspace_id,
        api_key_id: payload.api_key_id,
        role: payload.role,
        csrf_token: payload.csrf_token,
        expires_at: payload.expires_at,
      },
      signature: token.signature,
    };
  } catch {
    return null;
  }
}

export async function validateDashboardSession(
  req: NextRequest,
  db: SupabaseClient,
  now = new Date()
): Promise<{ valid: true; workspace_id: string; api_key_id: string; role: ApiKeyRole; csrf_token: string } | { valid: false; error: string }> {
  const secret = sessionSecret();
  if (!secret) return { valid: false, error: "Dashboard session secret is not configured" };

  const raw = req.cookies.get(DASHBOARD_SESSION_COOKIE)?.value;
  if (!raw) return { valid: false, error: "Missing x-api-key header" };

  const token = parseToken(raw);
  if (!token) return { valid: false, error: "Invalid dashboard session" };

  const encodedPayload = base64url(JSON.stringify(token.payload));
  const expectedSignature = await hmacSha256(secret, encodedPayload);
  if (!safeEqual(token.signature, expectedSignature)) return { valid: false, error: "Invalid dashboard session" };

  if (Number.isNaN(Date.parse(token.payload.expires_at)) || new Date(token.payload.expires_at) <= now) {
    return { valid: false, error: "Dashboard session expired" };
  }

  const { data, error } = await db
    .from("api_keys")
    .select("id, workspace_id, is_active, role")
    .eq("id", token.payload.api_key_id)
    .eq("workspace_id", token.payload.workspace_id)
    .maybeSingle<Pick<DbApiKey, "id" | "workspace_id" | "is_active" | "role">>();

  if (error || !data || !data.is_active) {
    return { valid: false, error: "Dashboard session API key is no longer active" };
  }

  return {
    valid: true,
    workspace_id: data.workspace_id,
    api_key_id: data.id,
    role: data.role ?? token.payload.role,
    csrf_token: token.payload.csrf_token,
  };
}

export function isMutationMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export function validateCsrfHeader(req: NextRequest, expectedToken: string): boolean {
  return req.headers.get("x-aurel-csrf") === expectedToken;
}
