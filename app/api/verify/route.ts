import { type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateRequest } from "@/lib/auth";
import { runRuleEngine } from "@/lib/rules/engine";
import { analyzeIntent } from "@/lib/claude/analyze";
import { evaluatePolicy } from "@/lib/policies/evaluate";
import { getWorkspaceConfig } from "@/lib/workspaces";
import { shouldEscalate } from "@/lib/webhooks/notify";
import { enqueueWebhookJob } from "@/lib/webhooks/queue";
import { err, json } from "@/lib/respond";
import { withTimeout } from "@/lib/timeout";
import { assertEnv } from "@/lib/env";
import { recordLayerMetric, captureError } from "@/lib/monitoring";
import { checkWorkspaceRateLimit } from "@/lib/ratelimit";
import { AUDIT_SIGNATURE_VERSION, signAuditDecision } from "@/lib/audit";
import { evaluateMandate, SignedMandateSchema } from "@/lib/mandates";
import { getMissionScope, hashPaymentIntent } from "@/lib/payment-intent";
import { normalizeWorkspaceStatus, reserveWorkspaceVerification } from "@/lib/entitlements";
import type { RuleDecision, VerifyResponse } from "@/types";

const MAX_VERIFY_BODY_BYTES = 32_000;

// ─── Validation schema ────────────────────────────────────────────────────────

const PaymentIntentSchema = z.object({
  intent_id: z.string().min(1),
  agent_id: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().min(1).max(10).toUpperCase(),
  recipient: z.string().min(1),
  merchant_id: z.string().optional(),
  agent_context: z.string().max(2000).optional(),
  mission_scope: z.string().max(1000).optional(),
  mandate: SignedMandateSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── POST /api/verify ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  assertEnv();

  // 1. Authenticate
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const { db, workspace_id } = auth;

  const rateLimit = await checkWorkspaceRateLimit(workspace_id);
  if (!rateLimit.allowed) {
    return err("Workspace verification rate limit exceeded", 429);
  }

  // 2. Parse & validate body
  let body: unknown;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > MAX_VERIFY_BODY_BYTES) {
      return err("Request body too large", 413);
    }
    body = JSON.parse(raw);
  } catch {
    return err("Invalid JSON body", 400);
  }

  const parsed = PaymentIntentSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.issues.map((i: z.ZodIssue) => i.message).join(", "), 422);
  }

  const intent = { ...parsed.data, workspace_id };
  const intentPayloadHash = hashPaymentIntent(parsed.data);

  // 3. Workspace config and beta/billing entitlements
  const wsConfig = await getWorkspaceConfig(intent.workspace_id, db);
  if (normalizeWorkspaceStatus(wsConfig.policy?.workspace_status) === "suspended") {
    return err("Workspace is suspended. Verification is disabled until access is restored.", 403);
  }

  // 4. Idempotency — return cached decision for known intent_id
  const { data: existing } = await db
    .from("verify_logs")
    .select("decision, risk_score, triggered_rule, audit_signature, audit_signature_version, intent_payload_hash, created_at")
    .eq("workspace_id", intent.workspace_id)
    .eq("intent_id", intent.intent_id)
    .maybeSingle();

  if (existing) {
    if (!existing.intent_payload_hash || existing.intent_payload_hash !== intentPayloadHash) {
      return err("intent_id was already used with a different payload", 409);
    }
    const response: VerifyResponse = {
      decision: existing.decision,
      reason: "Returned from cache (idempotent)",
      triggered_rule: existing.triggered_rule ?? undefined,
      risk_score: existing.risk_score,
      evaluated_at: existing.created_at ?? new Date().toISOString(),
      intent_id: intent.intent_id,
      audit_signature: existing.audit_signature ?? undefined,
      audit_signature_version: existing.audit_signature_version ?? undefined,
    };
    return json(response);
  }

  const entitlement = await reserveWorkspaceVerification(db, intent.workspace_id, intent.intent_id, wsConfig.policy);
  if (!entitlement.allowed) {
    return err(entitlement.reason, entitlement.status);
  }

  // 5. Run deterministic rule engine (5 s DB timeout)
  const rulesStart = performance.now();
  let engineResult;
  try {
    engineResult = await withTimeout(runRuleEngine(intent, db), 5_000, "rule-engine");
  } catch (e) {
    captureError(e, { layer: "rules", workspace_id: intent.workspace_id });
    console.error("[verify] Rule engine error:", e);
    return err("Internal rule evaluation error", 500);
  }
  recordLayerMetric({
    layer: "rules",
    decision: engineResult.decision,
    risk_score: engineResult.risk_score,
    duration_ms: Math.round(performance.now() - rulesStart),
    workspace_id: intent.workspace_id,
    agent_id: intent.agent_id,
  });

  let finalDecision: RuleDecision = engineResult.decision;
  let finalReason = engineResult.reason;
  let finalRiskScore = engineResult.risk_score;

  // 6. Signed mandate — skip if rule engine already blocked
  if (finalDecision !== "block" && intent.mandate) {
    const mandateResult = evaluateMandate(intent, intent.mandate);
    if (mandateResult) {
      finalDecision = mandateResult.decision;
      finalReason = mandateResult.reason;
      finalRiskScore = Math.max(finalRiskScore, mandateResult.risk_score);
    } else {
      const { data: activeMandate, error: mandateError } = await db
        .from("mandates")
        .select("mandate_id, signature, revoked_at, expires_at")
        .eq("workspace_id", intent.workspace_id)
        .eq("mandate_id", intent.mandate.payload.mandate_id)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (mandateError) {
        finalDecision = "block";
        finalReason = "Mandate registry lookup failed";
        finalRiskScore = Math.max(finalRiskScore, 100);
      } else if (!activeMandate || activeMandate.signature !== intent.mandate.signature.toLowerCase()) {
        finalDecision = "block";
        finalReason = "Mandate is not active in the workspace registry";
        finalRiskScore = Math.max(finalRiskScore, 95);
      }
    }
  }

  // 7. Operator policy — skip if already blocked
  if (finalDecision !== "block" && wsConfig.policy) {
    const policyResult = evaluatePolicy(intent, wsConfig.policy);
    if (policyResult) {
      finalDecision = policyResult.decision;
      finalReason = policyResult.reason;
      finalRiskScore = Math.max(finalRiskScore, policyResult.risk_score);
    }
  }

  // 8. Semantic layer — only when agent_context is present and not already blocked
  if (intent.agent_context && finalDecision !== "block") {
    const semanticStart = performance.now();
    const semantic = await analyzeIntent({
      amount: intent.amount,
      currency: intent.currency,
      recipient: intent.recipient,
      merchant_id: intent.merchant_id,
      agent_context: intent.agent_context,
      mission_scope: getMissionScope(intent),
    });
    recordLayerMetric({
      layer: "semantic",
      decision: semantic.injection_detected ? "block" : semantic.anomaly_detected ? "flag" : "allow",
      risk_score: semantic.risk_score,
      duration_ms: Math.round(performance.now() - semanticStart),
      workspace_id: intent.workspace_id,
      agent_id: intent.agent_id,
    });

    if (semantic.injection_detected) {
      finalDecision = "block";
      finalReason = `Prompt injection detected: ${semantic.explanation}`;
      finalRiskScore = Math.max(finalRiskScore, semantic.risk_score);
    } else if (semantic.unavailable && wsConfig.semantic_fail_mode !== "allow") {
      finalDecision = wsConfig.semantic_fail_mode;
      finalReason = `Semantic analysis unavailable: ${semantic.explanation}`;
      finalRiskScore = Math.max(finalRiskScore, wsConfig.semantic_fail_mode === "block" ? 100 : 70);
    } else if (semantic.anomaly_detected) {
      finalDecision = "flag";
      finalReason = `Semantic anomaly detected: ${semantic.explanation}`;
      finalRiskScore = Math.max(finalRiskScore, semantic.risk_score);
    } else {
      finalRiskScore = Math.max(finalRiskScore, semantic.risk_score);
    }
  }

  // 9. Webhook escalation — durable queue processed by /api/cron/webhooks
  if (wsConfig.webhook && shouldEscalate(finalDecision, finalRiskScore, wsConfig.webhook, intent.amount)) {
    const queued = await enqueueWebhookJob(db, {
      workspace_id: intent.workspace_id,
      intent_id: intent.intent_id,
      event: "payment.escalation",
      config: wsConfig.webhook,
      payload: {
        event: "payment.escalation",
        intent_id: intent.intent_id,
        transaction: {
          amount: intent.amount,
          currency: intent.currency,
          recipient: intent.recipient,
          agent_id: intent.agent_id,
          merchant_id: intent.merchant_id,
        },
        decision: finalDecision,
        reason: finalReason,
        risk_score: finalRiskScore,
        timestamp: new Date().toISOString(),
      },
    });
    if (queued.error) console.error("[webhook] Failed to queue delivery:", queued.error);
  }

  // 10. Persist signed audit log before returning so idempotency and velocity remain reliable.
  const evaluatedAt = new Date().toISOString();
  const auditRecord = {
    workspace_id: intent.workspace_id,
    intent_id: intent.intent_id,
    agent_id: intent.agent_id,
    recipient: intent.recipient,
    merchant_id: intent.merchant_id ?? null,
    amount: intent.amount,
    currency: intent.currency,
    decision: finalDecision,
    triggered_rule: engineResult.triggered_rule ?? null,
    risk_score: finalRiskScore,
    evaluated_at: evaluatedAt,
  };
  const auditSignature = signAuditDecision(auditRecord);

  try {
    const { error } = await withTimeout(
      Promise.resolve(
        db.from("verify_logs").insert({
          intent_id: auditRecord.intent_id,
          workspace_id: auditRecord.workspace_id,
          agent_id: auditRecord.agent_id,
          recipient: auditRecord.recipient,
          merchant_id: auditRecord.merchant_id,
          mandate_id: intent.mandate?.payload.mandate_id ?? null,
          intent_payload_hash: intentPayloadHash,
          amount: intent.amount,
          currency: auditRecord.currency,
          agent_context: intent.agent_context ?? null,
          decision: auditRecord.decision,
          triggered_rule: auditRecord.triggered_rule,
          risk_score: auditRecord.risk_score,
          review_status: finalDecision === "flag" ? "pending" : "not_required",
          audit_signature: auditSignature,
          audit_signature_version: AUDIT_SIGNATURE_VERSION,
          created_at: evaluatedAt,
        })
      ) as Promise<{ error: { message: string } | null }>,
      5_000,
      "audit-log-insert"
    );
    if (error) {
      // Two callers can evaluate the same intent concurrently. If the unique
      // workspace/intent index rejected this insert, replay the winner's
      // signed decision instead of surfacing a spurious 500.
      const raced = await db
        .from("verify_logs")
        .select("decision, risk_score, triggered_rule, audit_signature, audit_signature_version, intent_payload_hash, created_at")
        .eq("workspace_id", intent.workspace_id)
        .eq("intent_id", intent.intent_id)
        .maybeSingle();
      if (raced.data) {
        if (raced.data.intent_payload_hash !== intentPayloadHash) {
          return err("intent_id was already used with a different payload", 409);
        }
        const response: VerifyResponse = {
          decision: raced.data.decision,
          reason: "Returned from cache (idempotent)",
          triggered_rule: raced.data.triggered_rule ?? undefined,
          risk_score: raced.data.risk_score,
          evaluated_at: raced.data.created_at ?? new Date().toISOString(),
          intent_id: intent.intent_id,
          audit_signature: raced.data.audit_signature ?? undefined,
          audit_signature_version: raced.data.audit_signature_version ?? undefined,
        };
        return json(response);
      }
      captureError(error, { layer: "audit-log", workspace_id: intent.workspace_id });
      console.error("[verify] Failed to write audit log:", error.message);
      return err("Failed to persist audit log", 500);
    }
  } catch (e) {
    captureError(e, { layer: "audit-log", workspace_id: intent.workspace_id });
    console.error("[verify] Audit log write timeout:", e);
    return err("Audit log service unavailable", 503);
  }

  // 11. Return verdict
  const response: VerifyResponse = {
    decision: finalDecision,
    reason: finalReason,
    triggered_rule: engineResult.triggered_rule ?? undefined,
    risk_score: finalRiskScore,
    evaluated_at: evaluatedAt,
    intent_id: intent.intent_id,
    audit_signature: auditSignature,
    audit_signature_version: AUDIT_SIGNATURE_VERSION,
  };

  return json(response);
}
