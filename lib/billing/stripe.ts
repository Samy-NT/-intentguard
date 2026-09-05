import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const STRIPE_BILLING_PROVIDER = "stripe" as const;
export const BILLING_PLANS = ["starter", "pilot", "enterprise"] as const;
export type BillingPlan = (typeof BILLING_PLANS)[number];

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export interface StripeCheckoutInput {
  workspaceId: string;
  plan: BillingPlan;
  email?: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey?: string;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
  customer?: string | null;
  subscription?: string | null;
}

export interface StripeBillingPortalInput {
  customerId: string;
  returnUrl: string;
}

export interface StripeBillingPortalSession {
  id: string;
  url: string;
}

export interface StripeSubscriptionSnapshot {
  id: string;
  providerStatus: string;
  customerId?: string | null;
  workspaceStatus: BillingEntitlementEvent["workspaceStatus"];
  plan?: BillingPlan;
  monthlyLimit?: number | null;
  periodStart?: string;
  entitlementEvent: BillingEntitlementEvent;
}

export interface BillingEntitlementEvent {
  eventId: string;
  eventType: string;
  workspaceId: string;
  workspaceStatus: "active" | "trialing" | "past_due" | "suspended";
  plan?: BillingPlan;
  monthlyLimit?: number | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  periodStart?: string;
  payloadHash: string;
}

export function isBillingPlan(value: unknown): value is BillingPlan {
  return typeof value === "string" && (BILLING_PLANS as readonly string[]).includes(value);
}

export function stripeSecretKey(): string | null {
  return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

export function stripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export function billingAppUrl(): string | null {
  const value = process.env.BILLING_APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!value) return process.env.NODE_ENV === "production" ? null : "http://localhost:3000";
  try {
    const url = new URL(value);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function stripePriceId(plan: BillingPlan): string | null {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}` as const;
  return process.env[key]?.trim() || null;
}

export function billingPlanLimit(plan: BillingPlan): number | null | undefined {
  const raw = process.env.STRIPE_PLAN_LIMITS?.trim();
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!(plan in parsed)) return undefined;
    const value = parsed[plan];
    if (value === null) return null;
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

export function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret = stripeWebhookSecret(),
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  if (!secret || !signatureHeader) return false;

  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3).trim().toLowerCase())
    .filter((value) => /^[a-f0-9]{64}$/.test(value));
  const parsedTimestamp = Number(timestamp);
  if (!Number.isSafeInteger(parsedTimestamp) || Math.abs(nowSeconds - parsedTimestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${parsedTimestamp}.${rawBody}`)
    .digest("hex");
  return signatures.some((candidate) => safeEqualHex(candidate, expected));
}

export function hashBillingPayload(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

export function parseBillingEntitlementEvent(rawBody: string): BillingEntitlementEvent | null {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return null;
  }

  const eventId = typeof event.id === "string" ? event.id : "";
  const eventType = typeof event.type === "string" ? event.type : "";
  const object = ((event.data as Record<string, unknown> | undefined)?.object ?? {}) as Record<string, unknown>;
  if (!eventId || !eventType || !object || typeof object !== "object") return null;

  const metadata = metadataFrom(object);
  const workspaceId = metadata.workspace_id ?? stringValue(object.client_reference_id);
  if (!workspaceId) return null;

  const status = statusForEvent(eventType, stringValue(object.status), stringValue(object.payment_status));
  if (!status) return null;

  const planValue = metadata.plan;
  const plan = isBillingPlan(planValue) ? planValue : undefined;
  const monthlyLimit = plan ? billingPlanLimit(plan) : undefined;
  if (plan && monthlyLimit === undefined) return null;

  const subscriptionId =
    stringValue(object.subscription) ??
    stringValue(object.id && eventType.startsWith("customer.subscription.") ? object.id : undefined);
  const customerId = stringValue(object.customer);
  const periodStart = numberValue(object.current_period_start)
    ? new Date(numberValue(object.current_period_start)! * 1000).toISOString()
    : undefined;

  return {
    eventId,
    eventType,
    workspaceId,
    workspaceStatus: status,
    plan,
    monthlyLimit,
    customerId,
    subscriptionId,
    periodStart,
    payloadHash: hashBillingPayload(rawBody),
  };
}

export async function createStripeCheckoutSession(input: StripeCheckoutInput): Promise<StripeCheckoutSession> {
  const secret = stripeSecretKey();
  const priceId = stripePriceId(input.plan);
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (!priceId) throw new Error(`STRIPE_PRICE_${input.plan.toUpperCase()} is not configured`);

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  params.set("client_reference_id", input.workspaceId);
  params.set("metadata[workspace_id]", input.workspaceId);
  params.set("metadata[plan]", input.plan);
  params.set("subscription_data[metadata][workspace_id]", input.workspaceId);
  params.set("subscription_data[metadata][plan]", input.plan);
  if (input.email) params.set("customer_email", input.email);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
    },
    body: params.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof body?.error === "object" && body.error && "message" in body.error
      ? String((body.error as Record<string, unknown>).message)
      : "Stripe checkout session creation failed";
    throw new Error(message);
  }

  const id = stringValue(body?.id);
  const url = stringValue(body?.url);
  if (!id || !url) throw new Error("Stripe returned an invalid checkout session");
  return { id, url, customer: stringValue(body?.customer), subscription: stringValue(body?.subscription) };
}

export async function createStripeBillingPortalSession(
  input: StripeBillingPortalInput
): Promise<StripeBillingPortalSession> {
  const secret = stripeSecretKey();
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (!input.customerId.trim()) throw new Error("Stripe customer is not configured");

  const params = new URLSearchParams({ customer: input.customerId, return_url: input.returnUrl });
  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) throw new Error("Stripe billing portal session creation failed");
  const id = stringValue(body?.id);
  const url = stringValue(body?.url);
  if (!id || !url) throw new Error("Stripe returned an invalid billing portal session");
  return { id, url };
}

export async function retrieveStripeSubscription(subscriptionId: string): Promise<Record<string, unknown>> {
  const secret = stripeSecretKey();
  const id = subscriptionId.trim();
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (!id) throw new Error("Stripe subscription is not configured");

  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !body) throw new Error("Stripe subscription retrieval failed");
  if (stringValue(body.object) !== "subscription" || stringValue(body.id) !== id) {
    throw new Error("Stripe returned an invalid subscription");
  }
  return body;
}

export function parseStripeSubscriptionSnapshot(
  subscription: Record<string, unknown>,
  workspaceIdFallback: string
): StripeSubscriptionSnapshot | null {
  const subscriptionId = stringValue(subscription.id);
  const providerStatus = stringValue(subscription.status);
  const workspaceStatus = statusForSubscription(providerStatus);
  if (!subscriptionId || !providerStatus || !workspaceStatus) return null;

  const metadata = metadataFrom(subscription);
  const workspaceId = metadata.workspace_id ?? workspaceIdFallback.trim();
  if (!workspaceId) return null;

  const plan = isBillingPlan(metadata.plan) ? metadata.plan : planFromSubscriptionPrice(subscription);
  const monthlyLimit = plan ? billingPlanLimit(plan) : undefined;
  if (plan && monthlyLimit === undefined) return null;

  const rawBody = JSON.stringify(subscription);
  const payloadHash = hashBillingPayload(rawBody);
  const eventId = `stripe:reconcile:${subscriptionId}:${payloadHash.slice(0, 32)}`;
  const periodStart = numberValue(subscription.current_period_start)
    ? new Date(numberValue(subscription.current_period_start)! * 1000).toISOString()
    : undefined;
  const customerId = stringValue(subscription.customer);

  return {
    id: subscriptionId,
    providerStatus,
    customerId,
    workspaceStatus,
    plan,
    monthlyLimit,
    periodStart,
    entitlementEvent: {
      eventId,
      eventType: "stripe.subscription.reconciled",
      workspaceId,
      workspaceStatus,
      plan,
      monthlyLimit,
      customerId,
      subscriptionId,
      periodStart,
      payloadHash,
    },
  };
}

function metadataFrom(object: Record<string, unknown>): Record<string, string> {
  const candidates = [
    object.metadata,
    (object.subscription_details as Record<string, unknown> | undefined)?.metadata,
    ((object.lines as Record<string, unknown> | undefined)?.data as Array<Record<string, unknown>> | undefined)?.[0]?.metadata,
  ];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    return Object.fromEntries(
      Object.entries(candidate).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    );
  }
  return {};
}

function statusForEvent(
  eventType: string,
  providerStatus: string | undefined,
  paymentStatus: string | undefined
): BillingEntitlementEvent["workspaceStatus"] | null {
  if (eventType === "checkout.session.completed") {
    if (paymentStatus && paymentStatus !== "paid" && paymentStatus !== "no_payment_required") return null;
    return "active";
  }
  if (eventType === "invoice.paid") return "active";
  if (eventType === "invoice.payment_failed") return "past_due";
  if (eventType === "customer.subscription.deleted") return "suspended";
  if (eventType === "customer.subscription.created" || eventType === "customer.subscription.updated") {
    return statusForSubscription(providerStatus);
  }
  return null;
}

function statusForSubscription(providerStatus: string | undefined): BillingEntitlementEvent["workspaceStatus"] | null {
  if (providerStatus === "active") return "active";
  if (providerStatus === "trialing") return "trialing";
  if (providerStatus === "past_due" || providerStatus === "incomplete" || providerStatus === "paused") return "past_due";
  if (providerStatus === "canceled" || providerStatus === "unpaid" || providerStatus === "incomplete_expired") return "suspended";
  return null;
}

function planFromSubscriptionPrice(subscription: Record<string, unknown>): BillingPlan | undefined {
  const itemData = (subscription.items as Record<string, unknown> | undefined)?.data;
  if (!Array.isArray(itemData)) return undefined;

  const priceIds = itemData
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      return stringValue((record.price as Record<string, unknown> | undefined)?.id) ??
        stringValue((record.plan as Record<string, unknown> | undefined)?.id);
    })
    .filter((value): value is string => Boolean(value));

  return BILLING_PLANS.find((plan) => {
    const priceId = stripePriceId(plan);
    return Boolean(priceId && priceIds.includes(priceId));
  });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function safeEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
