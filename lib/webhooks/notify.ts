import type { RuleDecision } from "@/types";

// ─── Config & payload types ───────────────────────────────────────────────────

export interface WebhookConfig {
  url: string;
  secret?: string;
  threshold: number; // risk_score >= threshold → escalate
}

export interface EscalationPayload {
  event: "payment.escalation";
  intent_id: string;
  transaction: {
    amount: number;
    currency: string;
    recipient: string;
    agent_id: string;
    merchant_id?: string;
  };
  decision: RuleDecision;
  reason: string;
  risk_score: number;
  timestamp: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns true when this intent should trigger an operator notification. */
export function shouldEscalate(
  decision: RuleDecision,
  riskScore: number,
  config: WebhookConfig
): boolean {
  const escalate = decision === "flag" || riskScore >= config.threshold;
  console.log(
    `[webhook] shouldEscalate — decision=${decision} risk=${riskScore} threshold=${config.threshold} → ${escalate}`
  );
  return escalate;
}

/**
 * POSTs the escalation payload to the operator's webhook URL.
 * - Times out after 5 s
 * - Adds X-IntentGuard-Signature (HMAC-SHA256) when a secret is configured
 * - Never throws — all errors are logged and swallowed (fail-open)
 */
export async function fireWebhook(
  payload: EscalationPayload,
  config: WebhookConfig
): Promise<void> {
  console.log(`[webhook] firing → ${config.url}`, {
    intent_id: payload.intent_id,
    decision: payload.decision,
    risk_score: payload.risk_score,
    has_secret: !!config.secret,
  });

  const body = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-IntentGuard-Event": "payment.escalation",
  };

  if (config.secret) {
    headers["X-IntentGuard-Signature"] = `sha256=${await hmacSha256(config.secret, body)}`;
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 5_000);

  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers,
      body,
      signal: abort.signal,
    });

    if (res.ok) {
      console.log(`[webhook] delivered — HTTP ${res.status} to ${config.url}`);
    } else {
      console.error(`[webhook] delivery failed — HTTP ${res.status} to ${config.url}`);
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error(`[webhook] delivery error (${config.url}): ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

// ─── HMAC-SHA256 via Web Crypto (available in Next.js Edge & Node runtimes) ──

async function hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
