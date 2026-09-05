import { type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  parseBillingEntitlementEvent,
  stripeWebhookSecret,
  verifyStripeWebhookSignature,
} from "@/lib/billing/stripe";
import { err, json } from "@/lib/respond";

export const runtime = "nodejs";

const MAX_WEBHOOK_BYTES = 256_000;
const BILLING_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export async function POST(req: NextRequest) {
  const secret = stripeWebhookSecret();
  if (!secret) return err("Billing webhook is not configured", 503);

  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).length > MAX_WEBHOOK_BYTES) return err("Request body too large", 413);
  if (!verifyStripeWebhookSignature(rawBody, req.headers.get("stripe-signature"), secret)) {
    return err("Invalid Stripe webhook signature", 400);
  }

  let parsedJson: { type?: unknown };
  try {
    parsedJson = JSON.parse(rawBody) as { type?: unknown };
  } catch {
    return err("Invalid webhook JSON", 400);
  }
  if (typeof parsedJson.type !== "string") return err("Invalid Stripe event", 422);
  if (!BILLING_EVENT_TYPES.has(parsedJson.type)) return json({ received: true, ignored: true });

  const event = parseBillingEntitlementEvent(rawBody);
  if (!event) return err("Stripe event is missing workspace metadata or a supported entitlement", 422);

  try {
    const db = createServerClient();
    const rpc = (db as typeof db & { rpc?: (...args: unknown[]) => unknown }).rpc;
    if (typeof rpc !== "function") return err("Billing persistence is not available", 503);
    const { data, error } = (await db.rpc("apply_billing_entitlement", {
      p_event_id: event.eventId,
      p_provider: "stripe",
      p_event_type: event.eventType,
      p_workspace_id: event.workspaceId,
      p_workspace_status: event.workspaceStatus,
      p_billing_plan: event.plan ?? null,
      p_monthly_limit: event.monthlyLimit ?? null,
      p_customer_id: event.customerId ?? null,
      p_subscription_id: event.subscriptionId ?? null,
      p_period_start: event.periodStart ?? null,
      p_payload_hash: event.payloadHash,
    })) as { data: Array<{ applied: boolean; duplicate: boolean }> | null; error: { message: string } | null };
    if (error) {
      console.error("[billing] Failed to apply entitlement:", error.message);
      return err("Billing entitlement could not be applied", 503);
    }
    const result = data?.[0];
    if (!result) return err("Billing entitlement returned an invalid result", 503);
    return json({ received: true, duplicate: result.duplicate === true });
  } catch (error) {
    console.error("[billing] Webhook processing failed:", error);
    return err("Billing webhook processing failed", 503);
  }
}
