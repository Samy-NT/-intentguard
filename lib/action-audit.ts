import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AurelActionRequest, AurelSecurityDecision } from "@/lib/actions/protocol";
import {
  ACTION_AUDIT_SIGNATURE_VERSION,
  canonicalizeAuditValue,
  signActionAuditDecision,
  type ActionAuditDecisionRecord,
} from "@/lib/audit";

export interface StoredActionAudit {
  id: string;
  workspace_id: string;
  action_id: string;
  integration: string;
  agent_id: string | null;
  decision: string;
  reason: string | null;
  risk_score: number;
  rule_ids: string[];
  policy_version: string | null;
  trace_id: string | null;
  payload_hash: string;
  audit_signature: string;
  audit_signature_version: string;
  created_at: string;
}

export interface ActionAuditResult {
  record: ActionAuditDecisionRecord;
  signature: string;
  signature_version: string;
}

export function hashActionPayload(action: AurelActionRequest): string {
  return createHash("sha256").update(canonicalizeAuditValue(action)).digest("hex");
}

export function buildActionAudit(
  workspaceId: string,
  action: AurelActionRequest,
  decision: AurelSecurityDecision,
  evaluatedAt = new Date().toISOString(),
  signingSecret?: string
): ActionAuditResult {
  const record: ActionAuditDecisionRecord = {
    workspace_id: workspaceId,
    action_id: action.action.id,
    integration: action.integration,
    agent_id: action.agent.id ?? null,
    decision: decision.decision,
    reason: decision.reason ?? null,
    risk_score: Math.max(0, Math.min(100, Math.round(decision.riskScore ?? 0))),
    rule_ids: (decision.ruleIds ?? []).slice(0, 128),
    policy_version: decision.policyVersion ?? null,
    trace_id: decision.traceId ?? null,
    payload_hash: hashActionPayload(action),
    evaluated_at: evaluatedAt,
  };
  return {
    record,
    signature: signActionAuditDecision(record, signingSecret),
    signature_version: ACTION_AUDIT_SIGNATURE_VERSION,
  };
}

function supportsTable(db: SupabaseClient): boolean {
  return typeof (db as unknown as { from?: unknown }).from === "function";
}

export async function findActionAudit(
  db: SupabaseClient,
  workspaceId: string,
  actionId: string
): Promise<{ data: StoredActionAudit | null; error: string | null; available: boolean }> {
  if (!supportsTable(db)) return { data: null, error: null, available: false };
  const { data, error } = await db
    .from("action_audit_logs")
    .select("id, workspace_id, action_id, integration, agent_id, decision, reason, risk_score, rule_ids, policy_version, trace_id, payload_hash, audit_signature, audit_signature_version, created_at")
    .eq("workspace_id", workspaceId)
    .eq("action_id", actionId)
    .maybeSingle();
  return { data: (data as StoredActionAudit | null) ?? null, error: error?.message ?? null, available: true };
}

export async function persistActionAudit(
  db: SupabaseClient,
  result: ActionAuditResult
): Promise<{ error: string | null; available: boolean }> {
  if (!supportsTable(db)) return { error: null, available: false };
  const { error } = await db.from("action_audit_logs").insert({
    workspace_id: result.record.workspace_id,
    action_id: result.record.action_id,
    integration: result.record.integration,
    agent_id: result.record.agent_id,
    decision: result.record.decision,
    reason: result.record.reason,
    risk_score: result.record.risk_score,
    rule_ids: result.record.rule_ids,
    policy_version: result.record.policy_version,
    trace_id: result.record.trace_id,
    payload_hash: result.record.payload_hash,
    audit_signature: result.signature,
    audit_signature_version: result.signature_version,
    created_at: result.record.evaluated_at,
  });
  return { error: error?.message ?? null, available: true };
}

export function actionAuditResponse(log: StoredActionAudit): AurelSecurityDecision & {
  auditSignature: string;
  auditSignatureVersion: string;
  evaluatedAt: string;
} {
  return {
    decision: log.decision as AurelSecurityDecision["decision"],
    reason: log.reason ?? undefined,
    riskScore: log.risk_score,
    ruleIds: log.rule_ids ?? [],
    policyVersion: log.policy_version ?? undefined,
    traceId: log.trace_id ?? undefined,
    auditSignature: log.audit_signature,
    auditSignatureVersion: log.audit_signature_version,
    evaluatedAt: log.created_at,
  };
}
