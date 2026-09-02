import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DASHBOARD_SESSION_COOKIE, validateDashboardSessionToken } from "@/lib/dashboard-session";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(DASHBOARD_SESSION_COOKIE)?.value;

  if (!token) {
    redirect("/auth/login");
  }

  const db = createServerClient();
  const session = await validateDashboardSessionToken(token, db);

  if (!session.valid) {
    redirect("/auth/login");
  }

  return children;
}
