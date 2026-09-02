import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/app/auth/login/LoginForm";
import { DASHBOARD_SESSION_COOKIE, validateDashboardSessionToken } from "@/lib/dashboard-session";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(DASHBOARD_SESSION_COOKIE)?.value;

  if (token) {
    let hasValidSession = false;
    try {
      const session = await validateDashboardSessionToken(token, createServerClient());
      hasValidSession = session.valid;
    } catch {
      // Show the login form when local env or session validation is unavailable.
    }
    if (hasValidSession) redirect("/dashboard");
  }

  return <LoginForm />;
}
