import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbApiKey } from "@/types";

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface AuthResult {
  valid: boolean;
  workspace_id?: string;
  error?: string;
}

/** Validates the raw API key from the request header against hashed DB entries */
export async function validateApiKey(
  rawKey: string,
  db: SupabaseClient
): Promise<AuthResult> {
  const hash = await sha256(rawKey);

  const { data, error } = await db
    .from("api_keys")
    .select("workspace_id, is_active")
    .eq("key_hash", hash)
    .maybeSingle<Pick<DbApiKey, "workspace_id" | "is_active">>();

  if (error) {
    // DB or RLS error — log to distinguish from "key not found"
    console.error("[auth] DB error looking up API key:", error.message, "| hash:", hash);
    return { valid: false, error: "Invalid API key" };
  }

  if (!data) {
    console.error("[auth] No API key found for hash:", hash);
    return { valid: false, error: "Invalid API key" };
  }

  if (!data.is_active) {
    return { valid: false, error: "API key is revoked" };
  }

  return { valid: true, workspace_id: data.workspace_id };
}
