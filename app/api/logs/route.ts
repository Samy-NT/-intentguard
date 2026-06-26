import { type NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const { db, workspace_id } = auth;

  const { data, error } = await db
    .from("verify_logs")
    .select(
      "id, intent_id, agent_id, recipient, amount, currency, decision, risk_score, triggered_rule, review_status, review_note, reviewed_at, created_at"
    )
    .eq("workspace_id", workspace_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ logs: data ?? [] });
}
