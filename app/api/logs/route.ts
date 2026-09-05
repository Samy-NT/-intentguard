import { type NextRequest } from "next/server";
import { authenticateRequest, requireRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const forbidden = requireRole(auth, "operator");
  if (forbidden) return forbidden;
  const { db, workspace_id } = auth;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  let query = db
    .from("verify_logs")
    .select(
      "id, intent_id, agent_id, recipient, merchant_id, amount, currency, agent_context, decision, risk_score, triggered_rule, review_status, review_note, reviewed_at, audit_signature, audit_signature_version, created_at"
    )
    .eq("workspace_id", workspace_id)
    .order("created_at", { ascending: false });

  if (id) query = query.eq("id", id).limit(1);
  else query = query.limit(50);

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (id) {
    const log = data?.[0] ?? null;
    if (!log) return Response.json({ error: "Log not found" }, { status: 404 });
    return Response.json({ log });
  }

  return Response.json({ logs: data ?? [] });
}
