import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  createStripeCheckoutSession,
  createStripeBillingPortalSession,
  parseBillingEntitlementEvent,
  parseStripeSubscriptionSnapshot,
  retrieveStripeSubscription,
  verifyStripeWebhookSignature,
} from "@/lib/billing/stripe";

const saved = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of Object.keys(process.env)) {
    if (!(key in saved)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(saved)) process.env[key] = value;
});

describe("Stripe billing adapter", () => {
  it("verifies signed webhook payloads and rejects stale signatures", () => {
    const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
    const timestamp = 1_700_000_000;
    const secret = "whsec_test_secret";
    const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    const header = `t=${timestamp},v1=${digest}`;

    expect(verifyStripeWebhookSignature(body, header, secret, timestamp)).toBe(true);
    expect(verifyStripeWebhookSignature(body, header, secret, timestamp + 301)).toBe(false);
    expect(verifyStripeWebhookSignature(`${body} `, header, secret, timestamp)).toBe(false);
  });

  it("maps subscription metadata to a workspace entitlement", () => {
    process.env.STRIPE_PLAN_LIMITS = JSON.stringify({ starter: 1000, pilot: 10000, enterprise: null });
    const raw = JSON.stringify({
      id: "evt_subscription_1",
      type: "customer.subscription.updated",
      data: { object: {
        id: "sub_1",
        status: "active",
        customer: "cus_1",
        current_period_start: 1700000000,
        metadata: { workspace_id: "00000000-0000-0000-0000-000000000001", plan: "pilot" },
      } },
    });
    expect(parseBillingEntitlementEvent(raw)).toMatchObject({
      eventId: "evt_subscription_1",
      workspaceId: "00000000-0000-0000-0000-000000000001",
      workspaceStatus: "active",
      plan: "pilot",
      monthlyLimit: 10000,
      customerId: "cus_1",
      subscriptionId: "sub_1",
    });
  });

  it("does not provision access for an unpaid checkout session", () => {
    process.env.STRIPE_PLAN_LIMITS = JSON.stringify({ starter: 1000, pilot: 10000, enterprise: null });
    const raw = JSON.stringify({
      id: "evt_checkout_unpaid",
      type: "checkout.session.completed",
      data: { object: {
        payment_status: "unpaid",
        client_reference_id: "00000000-0000-0000-0000-000000000001",
        metadata: { plan: "pilot" },
      } },
    });
    expect(parseBillingEntitlementEvent(raw)).toBeNull();
  });

  it("creates a subscription checkout session with workspace metadata", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_" + "x".repeat(40);
    process.env.STRIPE_PRICE_PILOT = "price_pilot";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.com/cs_1" }), { status: 200 }));

    await expect(createStripeCheckoutSession({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      plan: "pilot",
      successUrl: "https://app.example.com/billing?checkout=success",
      cancelUrl: "https://app.example.com/billing?checkout=cancelled",
    })).resolves.toMatchObject({ id: "cs_1", url: "https://checkout.stripe.com/cs_1" });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.method).toBe("POST");
    expect(String(request.body)).toContain("mode=subscription");
    expect(String(request.body)).toContain("metadata%5Bworkspace_id%5D=00000000-0000-0000-0000-000000000001");
  });

  it("creates a short-lived customer portal session", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_" + "x".repeat(40);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "bps_1", url: "https://billing.stripe.com/p/session_1" }), { status: 200 }));
    await expect(createStripeBillingPortalSession({ customerId: "cus_1", returnUrl: "https://app.example.com/billing" })).resolves.toEqual({ id: "bps_1", url: "https://billing.stripe.com/p/session_1" });
    expect(String(fetchMock.mock.calls[0]?.[1] && (fetchMock.mock.calls[0]?.[1] as RequestInit).body)).toContain("customer=cus_1");
  });

  it("retrieves a Stripe subscription for reconciliation", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_" + "x".repeat(40);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "sub_1", object: "subscription", status: "active" }), { status: 200 }));

    await expect(retrieveStripeSubscription("sub_1")).resolves.toMatchObject({ id: "sub_1", status: "active" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.stripe.com/v1/subscriptions/sub_1", expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({ Authorization: expect.stringContaining("Bearer sk_test_") }),
    }));
  });

  it("maps a retrieved subscription snapshot and infers the plan from configured prices", () => {
    process.env.STRIPE_PRICE_PILOT = "price_pilot";
    process.env.STRIPE_PLAN_LIMITS = JSON.stringify({ starter: 1000, pilot: 10000, enterprise: null });

    const snapshot = parseStripeSubscriptionSnapshot({
      id: "sub_1",
      object: "subscription",
      status: "past_due",
      customer: "cus_1",
      current_period_start: 1700000000,
      items: { data: [{ price: { id: "price_pilot" } }] },
    }, "00000000-0000-0000-0000-000000000001");

    expect(snapshot).toMatchObject({
      id: "sub_1",
      providerStatus: "past_due",
      workspaceStatus: "past_due",
      plan: "pilot",
      monthlyLimit: 10000,
    });
    expect(snapshot?.entitlementEvent.eventId).toMatch(/^stripe:reconcile:sub_1:/);
  });
});
