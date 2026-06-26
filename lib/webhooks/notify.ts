import type { RuleDecision } from "@/types";
import { validateWebhookUrl } from "@/lib/webhooks/validate";

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

export type WebhookPayload = EscalationPayload | Record<string, unknown>;

export interface WebhookDeliveryResult {
  status: "blocked" | "delivered" | "failed";
  http_status?: number;
  error?: string;
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
  payload: WebhookPayload,
  config: WebhookConfig
): Promise<WebhookDeliveryResult> {
  const validation = await validateWebhookUrl(config.url);
  if (!validation.ok || !validation.normalizedUrl) {
    console.error(`[webhook] blocked unsafe URL: ${validation.error}`);
    return { status: "blocked", error: validation.error };
  }

  console.log("[webhook] firing", {
    event: typeof payload.event === "string" ? payload.event : "unknown",
    intent_id: typeof payload.intent_id === "string" ? payload.intent_id : null,
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
    const res = await fetch(validation.normalizedUrl, {
      method: "POST",
      headers,
      body,
      signal: abort.signal,
    });

    if (res.ok) {
      console.log(`[webhook] delivered — HTTP ${res.status}`);
      return { status: "delivered", http_status: res.status };
    } else {
      console.error(`[webhook] delivery failed — HTTP ${res.status}`);
      return { status: "failed", http_status: res.status };
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error(`[webhook] delivery error: ${reason}`);
    return { status: "failed", error: reason };
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
