import { createServerClient } from "@/lib/supabase/server";

// Dashboard only shows demo workspace data — filter explicitly to prevent
// cross-workspace data exposure if production workspaces ever share this DB.
const DEMO_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

export async function GET() {
  const db = createServerClient();

  const { data, error } = await db
    .from("verify_logs")
    .select(
      "id, intent_id, agent_id, recipient, amount, currency, decision, risk_score, triggered_rule, created_at"
    )
    .eq("workspace_id", DEMO_WORKSPACE_ID)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ logs: data ?? [] });
}
