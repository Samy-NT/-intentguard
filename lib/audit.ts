import { createHmac } from "node:crypto";

export const AUDIT_SIGNATURE_VERSION = "audit-v1-hmac-sha256";
export const ACTION_AUDIT_SIGNATURE_VERSION = "action-audit-v1-hmac-sha256";

export interface AuditDecisionRecord {
  workspace_id: string;
  intent_id: string;
  agent_id: string;
  recipient: string;
  merchant_id: string | null;
  amount: number;
  currency: string;
  decision: string;
  triggered_rule: string | null;
  risk_score: number;
  evaluated_at: string;
}

export function getAuditSigningSecret(): string {
  const [activeSecret] = getAuditVerificationSecrets();
  return activeSecret ?? "";
}

/** Minimal, non-sensitive record signed for generic agent/tool actions. */
export interface ActionAuditDecisionRecord {
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
  evaluated_at: string;
}

export function getAuditVerificationSecrets(): string[] {
  return (
    uniqueSecrets([
      process.env.AUDIT_SIGNING_SECRET,
      ...splitSecrets(process.env.AUDIT_SIGNING_PREVIOUS_SECRETS),
      process.env.INTENTGUARD_SECRET,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ])
  );
}

export function canonicalizeAuditValue(value: unknown): string {
  return JSON.stringify(sortForCanonicalJson(value));
}

export function signAuditDecision(
  record: AuditDecisionRecord,
  secret = getAuditSigningSecret()
): string {
  if (!secret) {
    throw new Error("[audit] Missing audit signing secret");
  }

  return createHmac("sha256", secret)
    .update(canonicalizeAuditValue({ version: AUDIT_SIGNATURE_VERSION, record }))
    .digest("hex");
}

export function verifyAuditDecisionSignature(
  record: AuditDecisionRecord,
  signature: string,
  secret?: string
): boolean {
  const normalizedSignature = signature.toLowerCase();
  const secrets = secret ? [secret] : getAuditVerificationSecrets();
  return secrets.some((candidate) => signAuditDecision(record, candidate) === normalizedSignature);
}

export function signActionAuditDecision(
  record: ActionAuditDecisionRecord,
  secret = getAuditSigningSecret()
): string {
  if (!secret) throw new Error("[audit] Missing audit signing secret");
  return createHmac("sha256", secret)
    .update(canonicalizeAuditValue({ version: ACTION_AUDIT_SIGNATURE_VERSION, record }))
    .digest("hex");
}

export function verifyActionAuditDecisionSignature(
  record: ActionAuditDecisionRecord,
  signature: string,
  secret?: string
): boolean {
  const normalizedSignature = signature.toLowerCase();
  const secrets = secret ? [secret] : getAuditVerificationSecrets();
  return secrets.some((candidate) => signActionAuditDecision(record, candidate) === normalizedSignature);
}

function sortForCanonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForCanonicalJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, sortForCanonicalJson(nested)])
    );
  }

  return value;
}

function splitSecrets(value: string | undefined): string[] {
  return value?.split(",").map((secret) => secret.trim()).filter(Boolean) ?? [];
}

function uniqueSecrets(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const secrets: string[] = [];

  for (const value of values) {
    const secret = value?.trim();
    if (!secret || seen.has(secret)) continue;
    seen.add(secret);
    secrets.push(secret);
  }

  return secrets;
}
