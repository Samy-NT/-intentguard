import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  requireRole: vi.fn(),
  createStripeCheckoutSession: vi.fn(),
  createStripeBillingPortalSession: vi.fn(),
  retrieveStripeSubscription: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authenticateRequest: mocks.authenticateRequest, requireRole: mocks.requireRole }));
vi.mock("@/lib/billing/stripe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/stripe")>("@/lib/billing/stripe");
  return {
    ...actual,
    createStripeCheckoutSession: mocks.createStripeCheckoutSession,
    createStripeBillingPortalSession: mocks.createStripeBillingPortalSession,
    retrieveStripeSubscription: mocks.retrieveStripeSubscription,
  };
});
vi.mock("@/lib/supabase/server", () => ({ createServerClient: mocks.createServerClient }));

import { POST as checkout } from "@/app/api/v1/billing/checkout/route";
import { POST as webhook } from "@/app/api/v1/billing/webhook/route";

const ENV_KEYS = ["BILLING_PROVIDER", "BILLING_APP_URL", "STRIPE_WEBHOOK_SECRET", "STRIPE_PLAN_LIMITS"] as const;

function request(url: string, body: string, headers: Record<string, string> = {}): NextRequest {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body }) as unknown as NextRequest;
}

describe("billing routes", () => {
  let previous: Record<string, string | undefined>;

  beforeEach(() => {
    vi.clearAllMocks();
    previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    mocks.requireRole.mockReturnValue(null);
    mocks.authenticateRequest.mockResolvedValue({ db: {}, workspace_id: "00000000-0000-0000-0000-000000000001", api_key_id: "key", role: "admin" });
    process.env.BILLING_PROVIDER = "stripe";
    process.env.BILLING_APP_URL = "https://app.example.com";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    process.env.STRIPE_PLAN_LIMITS = JSON.stringify({ starter: 1000, pilot: 10000, enterprise: null });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  it("starts a Stripe checkout for an authenticated workspace admin", async () => {
    mocks.createStripeCheckoutSession.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/cs_1" });
    const response = await checkout(request("http://localhost/api/billing/checkout", JSON.stringify({ plan: "pilot" })));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ provider: "stripe", checkout_session_id: "cs_1" });
    expect(mocks.createStripeCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "00000000-0000-0000-0000-000000000001", plan: "pilot" }));
  });

  it("verifies and applies a signed entitlement webhook", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: [{ applied: true, duplicate: false }], error: null }) };
    mocks.createServerClient.mockReturnValue(db);
    const body = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated", data: { object: {
      id: "sub_1", status: "active", customer: "cus_1",
      metadata: { workspace_id: "00000000-0000-0000-0000-000000000001", plan: "pilot" },
    } } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET!).update(`${timestamp}.${body}`).digest("hex");
    const response = await webhook(request("http://localhost/api/billing/webhook", body, { "stripe-signature": `t=${timestamp},v1=${signature}` }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ received: true, duplicate: false });
    expect(db.rpc).toHaveBeenCalledWith("apply_billing_entitlement", expect.objectContaining({ p_event_id: "evt_1", p_billing_plan: "pilot" }));
  });

  it("opens the customer portal only for a linked workspace customer", async () => {
    const db = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { policy: { billing_customer_id: "cus_1" } }, error: null }) })) })) })),
    };
    mocks.authenticateRequest.mockResolvedValueOnce({ db, workspace_id: "00000000-0000-0000-0000-000000000001", api_key_id: "key", role: "admin" });
    mocks.createStripeBillingPortalSession.mockResolvedValue({ id: "bps_1", url: "https://billing.stripe.com/p/session_1" });
    const response = await (await import("@/app/api/v1/billing/portal/route")).POST(request("http://localhost/api/billing/portal", ""));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ portal_session_id: "bps_1", portal_url: "https://billing.stripe.com/p/session_1" });
  });

  it("reconciles a linked Stripe subscription into local entitlements", async () => {
    const db = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { policy: { billing_customer_id: "cus_1", billing_subscription_id: "sub_1" } }, error: null }) })) })) })),
      rpc: vi.fn().mockResolvedValue({ data: [{ applied: true, duplicate: false }], error: null }),
    };
    mocks.authenticateRequest.mockResolvedValueOnce({ db, workspace_id: "00000000-0000-0000-0000-000000000001", api_key_id: "key", role: "admin" });
    mocks.retrieveStripeSubscription.mockResolvedValue({
      id: "sub_1",
      object: "subscription",
      status: "active",
      customer: "cus_1",
      current_period_start: 1700000000,
      metadata: { workspace_id: "00000000-0000-0000-0000-000000000001", plan: "pilot" },
    });

    const response = await (await import("@/app/api/v1/billing/reconcile/route")).POST(request("http://localhost/api/billing/reconcile", ""));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      provider: "stripe",
      reconciled: true,
      duplicate: false,
      subscription_id: "sub_1",
      workspace_status: "active",
      billing_plan: "pilot",
    });
    expect(db.rpc).toHaveBeenCalledWith("apply_billing_entitlement", expect.objectContaining({
      p_event_type: "stripe.subscription.reconciled",
      p_subscription_id: "sub_1",
      p_billing_plan: "pilot",
    }));
  });

  it("rejects reconciliation when the Stripe customer differs from the workspace customer", async () => {
    const db = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { policy: { billing_customer_id: "cus_expected", billing_subscription_id: "sub_1" } }, error: null }) })) })) })),
      rpc: vi.fn(),
    };
    mocks.authenticateRequest.mockResolvedValueOnce({ db, workspace_id: "00000000-0000-0000-0000-000000000001", api_key_id: "key", role: "admin" });
    mocks.retrieveStripeSubscription.mockResolvedValue({
      id: "sub_1",
      object: "subscription",
      status: "active",
      customer: "cus_other",
      metadata: { workspace_id: "00000000-0000-0000-0000-000000000001", plan: "pilot" },
    });

    const response = await (await import("@/app/api/v1/billing/reconcile/route")).POST(request("http://localhost/api/billing/reconcile", ""));
    expect(response.status).toBe(409);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
