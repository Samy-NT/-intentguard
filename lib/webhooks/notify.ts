import { request } from "node:https";
import type { RuleDecision } from "@/types";
import { validateWebhookUrl } from "@/lib/webhooks/validate";

// ─── Config & payload types ───────────────────────────────────────────────────

export interface WebhookConfig {
  url: string;
  secret?: string;
  threshold: number; // risk_score >= threshold → escalate
  escalate_on_block?: boolean;
  escalate_on_flag?: boolean;
  escalate_on_risk_score?: boolean;
  escalate_above_amount?: number;
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
  config: WebhookConfig,
  amount = 0
): boolean {
  const escalate =
    (decision === "block" && config.escalate_on_block !== false) ||
    (decision === "flag" && config.escalate_on_flag !== false) ||
    (config.escalate_on_risk_score !== false && riskScore >= config.threshold) ||
    (typeof config.escalate_above_amount === "number" &&
      config.escalate_above_amount > 0 &&
      amount >= config.escalate_above_amount);
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
  if (!validation.ok || !validation.normalizedUrl || !validation.resolvedAddresses?.length) {
    console.error(`[webhook] blocked unsafe URL: ${validation.error}`);
    return { status: "blocked", error: validation.error };
  }

  const body = JSON.stringify(payload);
  const event = typeof payload.event === "string" ? payload.event : "unknown";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-IntentGuard-Event": event,
  };

  if (config.secret) {
    headers["X-IntentGuard-Signature"] = `sha256=${await hmacSha256(config.secret, body)}`;
  }

  try {
    const res = await postJsonWithoutRedirects(validation.normalizedUrl, headers, body, validation.resolvedAddresses);

    if (res.statusCode >= 300 && res.statusCode < 400) {
      return { status: "blocked", http_status: res.statusCode, error: "Webhook redirects are not allowed" };
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return { status: "delivered", http_status: res.statusCode };
    } else {
      console.error(`[webhook] delivery failed — HTTP ${res.statusCode}`);
      return { status: "failed", http_status: res.statusCode };
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error(`[webhook] delivery error: ${reason}`);
    return { status: "failed", error: reason };
  }
}

function postJsonWithoutRedirects(
  rawUrl: string,
  headers: Record<string, string>,
  body: string,
  resolvedAddresses: string[]
): Promise<{ statusCode: number }> {
  return new Promise((resolve, reject) => {
    const url = new URL(rawUrl);
    let nextAddress = 0;
    const req = request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(body).toString(),
        },
        lookup: (_hostname, _options, callback) => {
          const address = resolvedAddresses[nextAddress % resolvedAddresses.length];
          nextAddress++;
          callback(null, address, address.includes(":") ? 6 : 4);
        },
        timeout: 5_000,
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0 }));
      }
    );

    req.on("timeout", () => req.destroy(new Error("Webhook request timed out")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
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
