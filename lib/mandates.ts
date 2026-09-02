import { createHmac } from "node:crypto";
import { z } from "zod";
import type { PaymentIntent, RuleDecision } from "@/types";
import { canonicalizeAuditValue, getAuditSigningSecret, getAuditVerificationSecrets } from "@/lib/audit";

export const MANDATE_SIGNATURE_VERSION = "mandate-v1-hmac-sha256";

export const MandatePayloadSchema = z.object({
  mandate_id: z.string().min(1).max(256),
  workspace_id: z.string().min(1).max(256),
  issued_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  mission_scope: z.string().min(1).max(1000),
  agent_id: z.string().max(256).optional(),
  max_amount: z.number().positive().optional(),
  currency: z.string().min(1).max(10).optional(),
  allowed_recipients: z.array(z.string().min(1).max(512)).max(256).optional(),
  allowed_merchants: z.array(z.string().min(1).max(512)).max(256).optional(),
  allowed_categories: z.array(z.string().min(1).max(128)).max(128).optional(),
  ap2: z
    .object({
      protocol_version: z.literal("v0.2").default("v0.2"),
      mode: z.enum(["human_present", "human_not_present"]),
      vct: z.enum(["mandate.checkout.open.1", "mandate.payment.open.1"]).optional(),
      checkout_hash: z.string().min(1).max(512).optional(),
      transaction_id: z.string().min(1).max(512).optional(),
    })
    .optional(),
  verifier: z
    .object({
      id: z.string().min(1).max(256),
      name: z.string().max(256).optional(),
    })
    .optional(),
});

export const SignedMandateSchema = z.object({
  payload: MandatePayloadSchema,
  signature: z.string().regex(/^[a-f0-9]{64}$/i),
  signature_version: z.literal(MANDATE_SIGNATURE_VERSION).optional(),
});

export type MandatePayload = z.infer<typeof MandatePayloadSchema>;
export type SignedMandate = z.infer<typeof SignedMandateSchema>;

export interface MandateEvaluationResult {
  decision: RuleDecision;
  reason: string;
  risk_score: number;
}

export function getMandateSigningSecret(): string {
  const [activeSecret] = getMandateVerificationSecrets();
  return activeSecret ?? "";
}

export function getMandateVerificationSecrets(): string[] {
  return uniqueSecrets([
    process.env.MANDATE_SIGNING_SECRET,
    ...splitSecrets(process.env.MANDATE_SIGNING_PREVIOUS_SECRETS),
    getAuditSigningSecret(),
    ...getAuditVerificationSecrets(),
  ]);
}

export function signMandate(payload: MandatePayload, secret = getMandateSigningSecret()): string {
  if (!secret) throw new Error("[mandate] Missing mandate signing secret");
  return createHmac("sha256", secret)
    .update(canonicalizeAuditValue({ version: MANDATE_SIGNATURE_VERSION, payload }))
    .digest("hex");
}

export function verifyMandateSignature(
  mandate: SignedMandate,
  secret?: string
): boolean {
  const normalizedSignature = mandate.signature.toLowerCase();
  const secrets = secret ? [secret] : getMandateVerificationSecrets();
  return secrets.some((candidate) => signMandate(mandate.payload, candidate) === normalizedSignature);
}

export function evaluateMandate(
  intent: PaymentIntent,
  mandate: SignedMandate,
  now = new Date()
): MandateEvaluationResult | null {
  if ((mandate.signature_version ?? MANDATE_SIGNATURE_VERSION) !== MANDATE_SIGNATURE_VERSION) {
    return block("Mandate signature version is unsupported", 100);
  }

  if (!verifyMandateSignature(mandate)) {
    return block("Mandate signature is invalid", 100);
  }

  const payload = mandate.payload;
  if (payload.workspace_id !== intent.workspace_id) {
    return block("Mandate was issued for a different workspace", 100);
  }

  if (new Date(payload.expires_at).getTime() <= now.getTime()) {
    return block("Mandate has expired", 95);
  }

  if (payload.agent_id && payload.agent_id !== intent.agent_id) {
    return block(`Mandate is restricted to agent ${payload.agent_id}`, 90);
  }

  if (typeof payload.max_amount === "number" && intent.amount > payload.max_amount) {
    return block(`Amount exceeds mandate cap of ${payload.max_amount}`, 95);
  }

  if (payload.currency && payload.currency.toUpperCase() !== intent.currency.toUpperCase()) {
    return block(`Currency ${intent.currency} is outside mandate currency ${payload.currency}`, 90);
  }

  if (payload.allowed_recipients?.length && !payload.allowed_recipients.includes(intent.recipient)) {
    return block(`Recipient "${intent.recipient}" is outside the mandate recipient list`, 95);
  }

  if (
    payload.allowed_merchants?.length &&
    (!intent.merchant_id || !payload.allowed_merchants.includes(intent.merchant_id))
  ) {
    return block(`Merchant "${intent.merchant_id ?? "unknown"}" is outside the mandate merchant list`, 90);
  }

  const category = intent.metadata?.category;
  if (
    payload.allowed_categories?.length &&
    (typeof category !== "string" || !payload.allowed_categories.includes(category))
  ) {
    return block("Intent category is outside the mandate category list", 85);
  }

  if (payload.ap2?.checkout_hash && intent.metadata?.checkout_hash !== payload.ap2.checkout_hash) {
    return block("Intent checkout hash does not match the AP2 mandate binding", 100);
  }

  if (payload.ap2?.transaction_id && intent.metadata?.transaction_id !== payload.ap2.transaction_id) {
    return block("Intent transaction id does not match the AP2 mandate binding", 100);
  }

  return null;
}

function block(reason: string, risk_score: number): MandateEvaluationResult {
  return { decision: "block", reason, risk_score };
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
