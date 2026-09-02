import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AUDIT_SIGNATURE_VERSION,
  signAuditDecision,
  type AuditDecisionRecord,
} from "@/lib/audit";

interface UnsignedAuditLogRow {
  id: string;
  workspace_id: string;
  intent_id: string;
  agent_id: string;
  recipient: string;
  merchant_id: string | null;
  amount: number | string;
  currency: string;
  decision: string;
  triggered_rule: string | null;
  risk_score: number | string;
  created_at: string;
}

export interface AuditBackfillResult {
  scanned: number;
  signed: number;
  failed: number;
  errors: string[];
}

export function auditRecordFromLog(row: UnsignedAuditLogRow): AuditDecisionRecord {
  return {
    workspace_id: row.workspace_id,
    intent_id: row.intent_id,
    agent_id: row.agent_id,
    recipient: row.recipient,
    merchant_id: row.merchant_id ?? null,
    amount: Number(row.amount),
    currency: row.currency,
    decision: row.decision,
    triggered_rule: row.triggered_rule ?? null,
    risk_score: Number(row.risk_score),
    evaluated_at: row.created_at,
  };
}

export async function backfillUnsignedAuditLogs(
  db: SupabaseClient,
  limit = 500
): Promise<AuditBackfillResult> {
  const boundedLimit = Math.min(1000, Math.max(1, Math.floor(limit)));
  const { data, error } = await db
    .from("verify_logs")
    .select(
      "id, workspace_id, intent_id, agent_id, recipient, merchant_id, amount, currency, decision, triggered_rule, risk_score, created_at"
    )
    .is("audit_signature", null)
    .order("created_at", { ascending: true })
    .limit(boundedLimit);

  if (error) {
    return { scanned: 0, signed: 0, failed: 1, errors: [error.message] };
  }

  const rows = (data ?? []) as UnsignedAuditLogRow[];
  const result: AuditBackfillResult = {
    scanned: rows.length,
    signed: 0,
    failed: 0,
    errors: [],
  };

  for (const row of rows) {
    try {
      const signature = signAuditDecision(auditRecordFromLog(row));
      const { error: updateError } = await db
        .from("verify_logs")
        .update({
          audit_signature: signature,
          audit_signature_version: AUDIT_SIGNATURE_VERSION,
        })
        .eq("id", row.id)
        .is("audit_signature", null);

      if (updateError) {
        result.failed += 1;
        result.errors.push(`${row.intent_id}: ${updateError.message}`);
      } else {
        result.signed += 1;
      }
    } catch (error) {
      result.failed += 1;
      result.errors.push(`${row.intent_id}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  return result;
}
