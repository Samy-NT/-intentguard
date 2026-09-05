import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { ApiKeyRole } from "@/types";

export interface DashboardAuthExchange {
  success: true;
  workspace_id: string;
  role: ApiKeyRole;
  csrf_token: string;
  expires_at?: string;
}

export async function requestSupabaseDashboardMagicLink(
  email: string,
  emailRedirectTo: string
): Promise<{ ok: true }> {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function completeSupabaseDashboardAuth(currentUrl: string): Promise<DashboardAuthExchange> {
  const supabase = createBrowserSupabaseClient();
  const url = new URL(currentUrl);
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw new Error(error.message);
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Supabase session was not found");

  const response = await fetch("/api/auth/supabase/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });
  const body = (await response.json().catch(() => null)) as Partial<DashboardAuthExchange> & { error?: string } | null;
  if (!response.ok || body?.success !== true || typeof body.csrf_token !== "string") {
    throw new Error(body?.error ?? "Unable to create dashboard session");
  }
  return body as DashboardAuthExchange;
}
