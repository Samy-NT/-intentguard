import { type NextRequest } from "next/server";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { parseStripeSubscriptionSnapshot, retrieveStripeSubscription } from "@/lib/billing/stripe";
import { err, json } from "@/lib/respond";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const forbidden = requireRole(auth, "admin");
  if (forbidden) return forbidden;
  if (process.env.BILLING_PROVIDER?.trim().toLowerCase() !== "stripe") {
    return err("Self-serve billing is not configured", 503);
  }

  const { data, error } = await auth.db
    .from("workspaces")
    .select("policy")
    .eq("id", auth.workspace_id)
    .maybeSingle();
  if (error) return err("Unable to load billing subscription", 503);

  const policy = data?.policy && typeof data.policy === "object" ? data.policy as Record<string, unknown> : {};
  const subscriptionId = typeof policy.billing_subscription_id === "string" ? policy.billing_subscription_id.trim() : "";
  const expectedCustomerId = typeof policy.billing_customer_id === "string" ? policy.billing_customer_id.trim() : "";
  if (!subscriptionId) return err("No Stripe subscription is linked to this workspace yet", 409);

  try {
    const subscription = await retrieveStripeSubscription(subscriptionId);
    const snapshot = parseStripeSubscriptionSnapshot(subscription, auth.workspace_id);
    if (!snapshot) return err("Stripe subscription could not be reconciled", 502);
    if (snapshot.entitlementEvent.workspaceId !== auth.workspace_id) {
      return err("Stripe subscription belongs to a different workspace", 409);
    }
    if (expectedCustomerId && snapshot.customerId !== expectedCustomerId) {
      return err("Stripe subscription customer does not match this workspace", 409);
    }

    const event = snapshot.entitlementEvent;
    const { data: appliedData, error: applyError } = (await auth.db.rpc("apply_billing_entitlement", {
      p_event_id: event.eventId,
      p_provider: "stripe",
      p_event_type: event.eventType,
      p_workspace_id: event.workspaceId,
      p_workspace_status: event.workspaceStatus,
      p_billing_plan: event.plan ?? null,
      p_monthly_verification_limit: event.monthlyLimit ?? null,
      p_customer_id: event.customerId ?? null,
      p_subscription_id: event.subscriptionId ?? null,
      p_current_period_start: event.periodStart ?? null,
      p_payload_hash: event.payloadHash,
    })) as { data: Array<{ applied: boolean; duplicate: boolean }> | null; error: { message: string } | null };
    if (applyError) {
      console.error("[billing] Failed to reconcile entitlement:", applyError.message);
      return err("Billing entitlement could not be reconciled", 503);
    }

    const applied = appliedData?.[0];
    if (!applied) return err("Billing reconciliation returned an invalid result", 503);

    return json({
      provider: "stripe",
      reconciled: applied.applied,
      duplicate: applied.duplicate,
      subscription_id: snapshot.id,
      provider_status: snapshot.providerStatus,
      workspace_status: snapshot.workspaceStatus,
      billing_plan: snapshot.plan ?? null,
      monthly_verification_limit: snapshot.monthlyLimit ?? null,
    });
  } catch (error) {
    console.error("[billing] Stripe reconciliation failed:", error);
    return err("Billing provider unavailable", 502);
  }
}
