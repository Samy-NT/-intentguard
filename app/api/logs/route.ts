import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const db = createServerClient();

  const { data, error } = await db
    .from("verify_logs")
    .select(
      "id, intent_id, agent_id, recipient, amount, currency, decision, risk_score, triggered_rule, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ logs: data ?? [] });
}
