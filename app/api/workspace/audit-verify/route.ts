import { type NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
  AUDIT_SIGNATURE_VERSION,
  verifyAuditDecisionSignature,
  type AuditDecisionRecord,
} from "@/lib/audit";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const { db, workspace_id } = auth;

  const url = new URL(req.url);
  const intentId = url.searchParams.get("intent_id");
  const id = url.searchParams.get("id");

  if (!intentId && !id) {
    return Response.json({ error: "Provide intent_id or id" }, { status: 422 });
  }

  let query = db
    .from("verify_logs")
    .select(
      "id, workspace_id, intent_id, agent_id, recipient, merchant_id, amount, currency, decision, triggered_rule, risk_score, audit_signature, audit_signature_version, created_at"
    )
    .eq("workspace_id", workspace_id);

  query = id ? query.eq("id", id) : query.eq("intent_id", intentId);

  const { data, error } = await query.maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Audit log not found" }, { status: 404 });

  if (!data.audit_signature) {
    return Response.json({
      valid: false,
      reason: "Audit log has no signature. It may predate signed audit trail support.",
      id: data.id,
      intent_id: data.intent_id,
      audit_signature_version: data.audit_signature_version ?? null,
    });
  }

  const record: AuditDecisionRecord = {
    workspace_id: data.workspace_id,
    intent_id: data.intent_id,
    agent_id: data.agent_id,
    recipient: data.recipient,
    merchant_id: data.merchant_id ?? null,
    amount: Number(data.amount),
    currency: data.currency,
    decision: data.decision,
    triggered_rule: data.triggered_rule ?? null,
    risk_score: Number(data.risk_score),
    evaluated_at: data.created_at,
  };

  const valid =
    data.audit_signature_version === AUDIT_SIGNATURE_VERSION &&
    verifyAuditDecisionSignature(record, data.audit_signature);

  return Response.json({
    valid,
    id: data.id,
    intent_id: data.intent_id,
    audit_signature: data.audit_signature,
    audit_signature_version: data.audit_signature_version,
    record,
  });
}
