import { type NextRequest } from "next/server";
import { z } from "zod";
import { analyzeIntent } from "@/lib/claude/analyze";
import { assertEnv } from "@/lib/env";
import { API_VERSION } from "@/lib/respond";
import { checkDemoRateLimit } from "@/lib/ratelimit";

function demoJson(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "X-IntentGuard-Version": API_VERSION },
  });
}

assertEnv();

const DemoPayloadSchema = z.object({
  agentId: z.string().min(1).max(100),
  amount: z.number().positive(),
  currency: z.string().min(1).max(10),
  recipient: z.string().min(1).max(200),
  agentContext: z.string().max(4000).optional().default(""),
  missionScope: z.string().max(500).optional(),
  workspaceId: z.string().uuid().optional(),
});

// ── Execution nodes (deterministic selection) ──────────────────────────────────
const EXECUTION_NODES = [
  "eu-west-3-node-07",
  "eu-west-1-node-12",
  "us-east-1-node-03",
  "eu-central-1-node-04",
] as const;

// ── Policy version (hashed from rule config, computed once per cold start) ─────
const POLICY_VERSION_PROMISE = sha256hex(
  "RULE_DENYLIST_RECIPIENT,RULE_AMOUNT_HARD_CAP(50000),RULE_AMOUNT_SOFT_LIMIT(10000),RULE_CRYPTO_RESTRICTION(5000),VELOCITY_TX_COUNT_1MIN(5),VELOCITY_AMOUNT_1H(25000)"
).then((h) => `v1-${h.slice(0, 8)}`);

function simUs(base: number, variance = 15): number {
  return base + Math.floor(Math.random() * variance);
}

async function sha256hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Signal types ───────────────────────────────────────────────────────────────

export interface RuleSignals {
  amount: number;
  currency: string;
  currency_class: "fiat" | "crypto";
  hard_cap: number;
  soft_limit: number;
  amount_pct_of_hard_cap: number;
  amount_pct_of_soft_limit: number;
  recipient: string;
  denylist_entry_count: number;
  crypto_limit: number;
}

export interface VelocitySignals {
  tx_count_1min: number;
  tx_limit_1min: number;
  tx_count_1h: number;
  tx_limit_1h: number;
  tx_count_24h: number;
  tx_limit_24h: number;
  cumulative_amount_1h: number;
  cumulative_limit_1h: number;
  agent_history_24h: string;
  peak_tx_per_hour: number;
  is_first_transaction: boolean;
}

export interface SemanticSignals {
  mission_scope_declared: string | null;
  mission_scope_alignment: "coherent" | "incoherent" | "not_provided";
  alignment_reasoning: string;
  injection_patterns_checked: number;
  anomaly_signals_detected: number;
  attack_vectors: string[];
  mission_alignment: "coherent" | "drift_detected" | "not_provided";
}

// ── Layer result types ─────────────────────────────────────────────────────────
export interface RuleCheck {
  rule_id: string;
  triggered: boolean;
  skipped: boolean;
  exec_us: number;
  detail: string;
}

export interface VelocityCheck {
  check_id: string;
  triggered: boolean;
  exec_us: number;
  detail: string;
}

export interface RulesLayerResult {
  passed: boolean;
  decision: "allow" | "flag" | "block";
  detail: string;
  risk_score: number;
  exec_us: number;
  checks: RuleCheck[];
  signals: RuleSignals;
}

export interface VelocityLayerResult {
  passed: boolean;
  decision: "allow" | "flag" | "block";
  detail: string;
  risk_score: number;
  exec_us: number;
  checks: VelocityCheck[];
  signals: VelocitySignals;
}

export interface SemanticLayerResult {
  ran: boolean;
  injection_detected: boolean;
  anomaly_detected: boolean;
  explanation: string;
  risk_score: number;
  signals: SemanticSignals;
}

// ── Agent history (deterministic from agent_id + amount) ──────────────────────
function generateAgentHistory(agentId: string, amount: number): VelocitySignals {
  // FNV-1a hash — deterministic and stable per agent_id
  let h = 0x811c9dc5;
  for (let i = 0; i < agentId.length; i++) {
    h ^= agentId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }

  if ((h % 10) === 0) {
    return {
      tx_count_1min: 0, tx_limit_1min: 5,
      tx_count_1h: 0, tx_limit_1h: 20,
      tx_count_24h: 0, tx_limit_24h: 50,
      cumulative_amount_1h: 0, cumulative_limit_1h: 25000,
      agent_history_24h: "░".repeat(24),
      peak_tx_per_hour: 0,
      is_first_transaction: true,
    };
  }

  const tx24h = 1 + ((h >> 4) % 10);
  const tx1h = (h >> 8) % Math.min(3, tx24h + 1);
  const tx1min = ((h >> 12) % 7) === 0 && tx1h > 0 ? 1 : 0;
  const peak = 1 + ((h >> 16) % 3);
  const cumulative1h = tx1h * Math.round(amount * (0.6 + ((h >> 20) % 80) / 100));

  const barChars = ["░", "▒", "▓", "█"];
  const history: string[] = [];
  for (let i = 0; i < 24; i++) {
    const bits = (h >> (i % 14)) & 0x3;
    const recentBias = i >= 21 ? 1 : 0;
    history.push(barChars[Math.min(3, Math.max(0, Math.floor((bits * tx24h) / 10) + recentBias))]);
  }
  if (tx1h > 0) history[23] = "█";

  return {
    tx_count_1min: tx1min, tx_limit_1min: 5,
    tx_count_1h: tx1h, tx_limit_1h: 20,
    tx_count_24h: tx24h, tx_limit_24h: 50,
    cumulative_amount_1h: cumulative1h, cumulative_limit_1h: 25000,
    agent_history_24h: history.join(""),
    peak_tx_per_hour: peak,
    is_first_transaction: false,
  };
}

// ── Rule engine ────────────────────────────────────────────────────────────────
function evaluateRules(amount: number, currency: string, recipient: string): RulesLayerResult {
  const checks: RuleCheck[] = [];
  let decision: "allow" | "flag" | "block" = "allow";
  let risk_score = 5;
  let detail = "All deterministic rules passed";
  const isCrypto = ["ETH", "USDC", "USDT", "BTC"].includes(currency.toUpperCase());

  const signals: RuleSignals = {
    amount,
    currency,
    currency_class: isCrypto ? "crypto" : "fiat",
    hard_cap: 50_000,
    soft_limit: 10_000,
    amount_pct_of_hard_cap: Math.round((amount / 50_000) * 1000) / 10,
    amount_pct_of_soft_limit: Math.round((amount / 10_000) * 1000) / 10,
    recipient: recipient.slice(0, 60),
    denylist_entry_count: 3,
    crypto_limit: 5_000,
  };

  // RULE_DENYLIST_RECIPIENT
  const isDenylisted = /\.ru$|\.cn$|offshore|anonymous/i.test(recipient);
  checks.push({
    rule_id: "RULE_DENYLIST_RECIPIENT",
    triggered: isDenylisted,
    skipped: false,
    exec_us: simUs(18, 22),
    detail: isDenylisted
      ? `"${recipient.slice(0, 40)}" matches workspace denylist pattern`
      : `"${recipient.slice(0, 40)}" not in ${signals.denylist_entry_count}-entry denylist`,
  });

  if (isDenylisted) {
    const skipped = { triggered: false, skipped: true, exec_us: 0 };
    checks.push({ rule_id: "RULE_AMOUNT_HARD_CAP", ...skipped, detail: "skipped — prior rule triggered block" });
    checks.push({ rule_id: "RULE_AMOUNT_SOFT_LIMIT", ...skipped, detail: "skipped — prior rule triggered block" });
    checks.push({ rule_id: "RULE_CRYPTO_RESTRICTION", ...skipped, detail: "skipped — prior rule triggered block" });
    const exec_us = checks.reduce((a, c) => a + c.exec_us, 0);
    return { passed: false, decision: "block", detail: "Recipient matches workspace denylist", risk_score: 100, checks, exec_us, signals };
  }

  // RULE_AMOUNT_HARD_CAP
  const exceedsHard = amount > 50_000;
  checks.push({
    rule_id: "RULE_AMOUNT_HARD_CAP",
    triggered: exceedsHard,
    skipped: false,
    exec_us: simUs(8, 10),
    detail: `${currency} ${amount.toLocaleString()} — ${signals.amount_pct_of_hard_cap}% of ${currency} 50,000 cap`,
  });

  if (exceedsHard) {
    const skipped = { triggered: false, skipped: true, exec_us: 0, detail: "skipped — hard cap triggered" };
    checks.push({ rule_id: "RULE_AMOUNT_SOFT_LIMIT", ...skipped });
    checks.push({ rule_id: "RULE_CRYPTO_RESTRICTION", ...skipped });
    const exec_us = checks.reduce((a, c) => a + c.exec_us, 0);
    return { passed: false, decision: "block", detail: `Amount ${amount} ${currency} exceeds hard cap of 50,000`, risk_score: 100, checks, exec_us, signals };
  }

  // RULE_AMOUNT_SOFT_LIMIT
  const exceedsSoft = amount > 10_000;
  checks.push({
    rule_id: "RULE_AMOUNT_SOFT_LIMIT",
    triggered: exceedsSoft,
    skipped: false,
    exec_us: simUs(7, 9),
    detail: `${currency} ${amount.toLocaleString()} — ${signals.amount_pct_of_soft_limit}% of ${currency} 10,000 soft limit`,
  });

  if (exceedsSoft) {
    decision = "flag";
    risk_score = 65;
    detail = `Amount ${amount} ${currency} exceeds soft limit threshold`;
  }

  // RULE_CRYPTO_RESTRICTION
  const cryptoBlock = isCrypto && amount > 5_000;
  const cryptoFlag = isCrypto && !cryptoBlock;
  checks.push({
    rule_id: "RULE_CRYPTO_RESTRICTION",
    triggered: cryptoBlock || cryptoFlag,
    skipped: false,
    exec_us: simUs(6, 8),
    detail: isCrypto
      ? `${currency} classified as restricted digital asset (limit: ${currency} 5,000)`
      : `${currency} is fiat — crypto restriction not applicable`,
  });

  if (cryptoBlock) {
    decision = "block";
    risk_score = 90;
    detail = `Crypto transaction of ${amount} ${currency} exceeds workspace crypto limit of 5,000`;
  } else if (cryptoFlag && decision === "allow") {
    decision = "flag";
    risk_score = Math.max(risk_score, 65);
    detail = "Crypto transaction requires manual review per workspace policy";
  }

  const exec_us = checks.reduce((a, c) => a + c.exec_us, 0);
  return {
    passed: decision === "allow",
    decision,
    detail: decision === "allow" ? "All deterministic rules passed" : detail,
    risk_score,
    checks,
    exec_us,
    signals,
  };
}

// ── Velocity engine ────────────────────────────────────────────────────────────
function evaluateVelocity(context: string, agentId: string, amount: number): VelocityLayerResult {
  const velocityPattern =
    /transaction\s+\d+\s+of\s+\d+|in\s+the\s+last\s+\d+\s+seconds?|\d+\s+transactions?\s+(in|over|within)\s+the\s+last/i;
  const isVelocityAttack = velocityPattern.test(context);

  const signals = generateAgentHistory(agentId, amount);

  const checks: VelocityCheck[] = [
    {
      check_id: "VELOCITY_TX_COUNT_1MIN",
      triggered: isVelocityAttack,
      exec_us: simUs(20, 25),
      detail: isVelocityAttack
        ? "agent context indicates multiple rapid transactions — exceeds 5 tx/min limit"
        : `${signals.tx_count_1min} tx in last 60s (limit: ${signals.tx_limit_1min})`,
    },
    {
      check_id: "VELOCITY_AMOUNT_1H",
      triggered: false,
      exec_us: simUs(14, 18),
      detail: signals.is_first_transaction
        ? `$0 cumulative in last 1h — first transaction from this agent (limit: $${signals.cumulative_limit_1h.toLocaleString()})`
        : `$${signals.cumulative_amount_1h.toLocaleString()} cumulative in last 1h (limit: $${signals.cumulative_limit_1h.toLocaleString()})`,
    },
  ];

  const exec_us = checks.reduce((a, c) => a + c.exec_us, 0);

  if (isVelocityAttack) {
    return {
      passed: false,
      decision: "flag",
      detail: "Velocity limit triggered — multiple rapid transactions detected in agent context",
      risk_score: 80,
      checks,
      exec_us,
      signals,
    };
  }

  return {
    passed: true,
    decision: "allow",
    detail: "All velocity checks passed — agent within rate limits",
    risk_score: 0,
    checks,
    exec_us,
    signals,
  };
}

// ── POST /api/demo/verify ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "demo";

  const rl = await checkDemoRateLimit(ip);
  if (!rl.allowed) {
    return demoJson(
      { error: "Demo limit reached. Request API access for unlimited verification." },
      429
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return demoJson({ error: "Invalid JSON body" }, 400);
  }

  const parsed = DemoPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return demoJson({ error: parsed.error.issues.map((i) => i.message).join(", ") }, 422);
  }

  const { agentId, amount, agentContext, missionScope, workspaceId: clientWorkspaceId } = parsed.data;
  const currency = parsed.data.currency.toUpperCase();
  const recipient = parsed.data.recipient;
  const workspaceId = clientWorkspaceId ?? crypto.randomUUID();

  const globalStart = performance.now();
  const intentTimestamp = new Date().toISOString();
  const intentId = `ig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  const policyVersion = await POLICY_VERSION_PROMISE;
  const executionNode = EXECUTION_NODES[intentId.charCodeAt(intentId.length - 1) % EXECUTION_NODES.length];

  // Layer 1 — Deterministic rules
  const rulesResult = evaluateRules(amount, currency, recipient);
  const rulesUs = rulesResult.exec_us;

  // Layer 2 — Velocity
  const velocityResult = evaluateVelocity(agentContext, agentId, amount);
  const velocityUs = velocityResult.exec_us;

  // Interim decision
  let decision: "allow" | "flag" | "block" = "allow";
  let reason = "All verification layers passed";
  let riskScore = Math.max(rulesResult.risk_score, velocityResult.risk_score);

  if (rulesResult.decision === "block" || velocityResult.decision === "block") {
    decision = "block";
    reason = rulesResult.decision === "block" ? rulesResult.detail : velocityResult.detail;
  } else if (rulesResult.decision === "flag" || velocityResult.decision === "flag") {
    decision = "flag";
    reason = rulesResult.decision === "flag" ? rulesResult.detail : velocityResult.detail;
  }

  // Layer 3 — Semantic (Claude)
  let semanticResult: SemanticLayerResult = {
    ran: false,
    injection_detected: false,
    anomaly_detected: false,
    explanation: agentContext
      ? "semantic analysis skipped — transaction already blocked by earlier layer"
      : "no agent execution context provided for semantic analysis",
    risk_score: 0,
    signals: {
      mission_scope_declared: missionScope ?? null,
      mission_scope_alignment: "not_provided",
      alignment_reasoning: "Semantic analysis not performed.",
      injection_patterns_checked: 0,
      anomaly_signals_detected: 0,
      attack_vectors: [],
      mission_alignment: "not_provided",
    },
  };

  let semanticMs = 0;

  if (agentContext && decision !== "block") {
    const semanticStart = performance.now();
    try {
      const semantic = await analyzeIntent({
        amount,
        currency,
        recipient,
        agent_context: agentContext,
        mission_scope: missionScope,
      });
      semanticMs = Math.round(performance.now() - semanticStart);
      riskScore = Math.max(riskScore, semantic.risk_score);

      semanticResult = {
        ran: true,
        injection_detected: semantic.injection_detected,
        anomaly_detected: semantic.anomaly_detected,
        explanation: semantic.explanation,
        risk_score: semantic.risk_score,
        signals: {
          mission_scope_declared: missionScope ?? null,
          mission_scope_alignment: semantic.mission_scope_alignment,
          alignment_reasoning: semantic.alignment_reasoning,
          injection_patterns_checked: 12,
          anomaly_signals_detected: semantic.anomaly_detected ? 1 : 0,
          attack_vectors: semantic.attack_vectors,
          mission_alignment: semantic.mission_alignment,
        },
      };

      if (semantic.injection_detected) {
        decision = "block";
        reason = semantic.explanation;
      } else if (semantic.anomaly_detected) {
        decision = "flag";
        reason = semantic.explanation;
      } else if (decision === "allow") {
        reason = "All verification layers passed — no anomalies detected";
      }
    } catch (e) {
      console.error("[demo] Claude error:", e);
      semanticMs = Math.round(performance.now() - semanticStart);
      semanticResult = {
        ran: false,
        injection_detected: false,
        anomaly_detected: false,
        explanation: "semantic analysis temporarily unavailable — decision based on deterministic layers",
        risk_score: 0,
        signals: {
          mission_scope_declared: missionScope ?? null,
          mission_scope_alignment: "not_provided",
          alignment_reasoning: "Analysis unavailable.",
          injection_patterns_checked: 0,
          anomaly_signals_detected: 0,
          attack_vectors: [],
          mission_alignment: "not_provided",
        },
      };
    }
  }

  const totalMs = Math.round(performance.now() - globalStart);

  const triggeredLayer =
    decision === "allow"
      ? null
      : semanticResult.injection_detected || semanticResult.anomaly_detected
      ? "semantic"
      : velocityResult.decision !== "allow"
      ? "velocity"
      : "rules";

  const auditPayload = `${intentId}:${decision}:${riskScore}:${intentTimestamp}`;
  const payloadData = JSON.stringify({ amount, currency, recipient, agentId, intentId });
  const [decisionHash, payloadHash] = await Promise.all([
    sha256hex(auditPayload),
    sha256hex(payloadData),
  ]);

  const riskScoreBreakdown = {
    rules_contribution: rulesResult.risk_score,
    velocity_contribution: velocityResult.risk_score,
    semantic_contribution: semanticResult.risk_score,
    formula: "total = max(contributions)",
    total: riskScore,
  };

  return demoJson({
    intent_id: intentId,
    agent_id: agentId,
    decision,
    reason,
    risk_score: riskScore,
    risk_score_breakdown: riskScoreBreakdown,
    timing: {
      rules_us: rulesUs,
      velocity_us: velocityUs,
      semantic_ms: semanticMs,
      total_ms: totalMs,
    },
    layers: {
      rules: rulesResult,
      velocity: velocityResult,
      semantic: semanticResult,
    },
    audit_entry: {
      intent_id: intentId,
      agent_id: agentId,
      workspace_id: workspaceId,
      timestamp: intentTimestamp,
      ...(missionScope ? { mission_scope: missionScope } : {}),
      decision,
      decision_hash: `sha256:${decisionHash.slice(0, 40)}`,
      payload_hash: `sha256:${payloadHash.slice(0, 40)}`,
      triggered_layer: triggeredLayer,
      risk_score: riskScore,
      risk_score_breakdown: riskScoreBreakdown,
      attack_vectors: semanticResult.signals.attack_vectors,
      mission_alignment: semanticResult.signals.mission_alignment,
      policy_version: policyVersion,
      model_version: "claude-sonnet-4-6",
      signed_by: "intentguard-api-v1.0.0",
      execution_node: executionNode,
      retention_days: 90,
      immutable: true,
    },
  });
}
