import { type NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { err, json } from "@/lib/respond";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const url = new URL(req.url);
  const actionId = url.searchParams.get("action_id");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 100);

  let query = auth.db
    .from("action_audit_logs")
    .select("id, workspace_id, action_id, integration, agent_id, decision, reason, risk_score, rule_ids, policy_version, trace_id, payload_hash, audit_signature, audit_signature_version, created_at")
    .eq("workspace_id", auth.workspace_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (actionId) query = query.eq("action_id", actionId);

  const { data, error } = await query;
  if (error) return err("Action audit service unavailable", 503);
  return json({ logs: data ?? [] });
}
