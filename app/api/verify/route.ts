import { type NextRequest } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { validateApiKey } from "@/lib/auth";
import { runRuleEngine } from "@/lib/rules/engine";
import { analyzeIntent } from "@/lib/claude/analyze";
import { evaluatePolicy } from "@/lib/policies/evaluate";
import { getWorkspaceConfig } from "@/lib/workspaces";
import { fireWebhook, shouldEscalate } from "@/lib/webhooks/notify";
import { err, json } from "@/lib/respond";
import { withTimeout } from "@/lib/timeout";
import { assertEnv } from "@/lib/env";
import { recordLayerMetric, captureError } from "@/lib/monitoring";
import type { RuleDecision, VerifyResponse } from "@/types";

assertEnv();

// ─── Validation schema ────────────────────────────────────────────────────────

const PaymentIntentSchema = z.object({
  intent_id: z.string().min(1),
  agent_id: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().min(1).max(10).toUpperCase(),
  recipient: z.string().min(1),
  merchant_id: z.string().optional(),
  agent_context: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── POST /api/verify ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Authenticate
  const rawKey = req.headers.get("x-api-key");
  if (!rawKey) return err("Missing x-api-key header", 401);

  const db = createServerClient();
  let auth;
  try {
    auth = await withTimeout(validateApiKey(rawKey, db), 5_000, "auth-lookup");
  } catch (e) {
    console.error("[verify] Auth timeout:", e);
    return err("Authentication service unavailable", 503);
  }
  if (!auth.valid) return err(auth.error ?? "Unauthorized", 401);

  // 2. Parse & validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body", 400);
  }

  const parsed = PaymentIntentSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.issues.map((i: z.ZodIssue) => i.message).join(", "), 422);
  }

  const intent = { ...parsed.data, workspace_id: auth.workspace_id! };

  // 3. Idempotency — return cached decision for known intent_id
  const { data: existing } = await db
    .from("verify_logs")
    .select("decision, risk_score, triggered_rule")
    .eq("intent_id", intent.intent_id)
    .maybeSingle();

  if (existing) {
    const response: VerifyResponse = {
      decision: existing.decision,
      reason: "Returned from cache (idempotent)",
      triggered_rule: existing.triggered_rule ?? undefined,
      risk_score: existing.risk_score,
      evaluated_at: new Date().toISOString(),
      intent_id: intent.intent_id,
    };
    return json(response);
  }

  // 4. Run deterministic rule engine (5 s DB timeout)
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

  // 5. Fetch workspace config (policy + webhook) — single DB round trip
  const wsConfig = await getWorkspaceConfig(intent.workspace_id, db);

  // 5a. Operator policy — skip if rule engine already blocked
  if (finalDecision !== "block" && wsConfig.policy) {
    const policyResult = evaluatePolicy(intent, wsConfig.policy);
    if (policyResult) {
      finalDecision = policyResult.decision;
      finalReason = policyResult.reason;
      finalRiskScore = Math.max(finalRiskScore, policyResult.risk_score);
    }
  }

  // 6. Semantic layer — only when agent_context is present and not already blocked
  if (intent.agent_context && finalDecision !== "block") {
    const semanticStart = performance.now();
    const semantic = await analyzeIntent({
      amount: intent.amount,
      currency: intent.currency,
      recipient: intent.recipient,
      merchant_id: intent.merchant_id,
      agent_context: intent.agent_context,
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
    } else if (semantic.anomaly_detected) {
      finalDecision = "flag";
      finalReason = `Semantic anomaly detected: ${semantic.explanation}`;
      finalRiskScore = Math.max(finalRiskScore, semantic.risk_score);
    } else {
      finalRiskScore = Math.max(finalRiskScore, semantic.risk_score);
    }
  }

  // 7. Webhook escalation (fire-and-forget — never delays the response)
  console.log("[verify] pre-webhook —", {
    decision: finalDecision,
    risk_score: finalRiskScore,
    webhook_configured: !!wsConfig.webhook,
    webhook_url: wsConfig.webhook?.url ?? null,
    webhook_threshold: wsConfig.webhook?.threshold ?? null,
  });
  if (wsConfig.webhook && shouldEscalate(finalDecision, finalRiskScore, wsConfig.webhook)) {
    fireWebhook(
      {
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
      wsConfig.webhook
    ).catch((e) => console.error("[webhook] Unhandled error:", e));
  }

  // 8. Persist audit log (fire and forget)
  db.from("verify_logs")
    .insert({
      intent_id: intent.intent_id,
      workspace_id: intent.workspace_id,
      agent_id: intent.agent_id,
      recipient: intent.recipient,
      merchant_id: intent.merchant_id ?? null,
      amount: intent.amount,
      currency: intent.currency,
      agent_context: intent.agent_context ?? null,
      decision: finalDecision,
      triggered_rule: engineResult.triggered_rule,
      risk_score: finalRiskScore,
    })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.error("[verify] Failed to write audit log:", error.message);
    });

  // 9. Return verdict
  const response: VerifyResponse = {
    decision: finalDecision,
    reason: finalReason,
    triggered_rule: engineResult.triggered_rule ?? undefined,
    risk_score: finalRiskScore,
    evaluated_at: new Date().toISOString(),
    intent_id: intent.intent_id,
  };

  return json(response);
}
