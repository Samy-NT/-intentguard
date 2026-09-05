import { type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { billingAppUrl, createStripeCheckoutSession, isBillingPlan, type BillingPlan } from "@/lib/billing/stripe";
import { readBoundedJsonBody } from "@/lib/http/body";
import { err, json } from "@/lib/respond";
import { validateIdempotencyKeyHeader } from "@/lib/http/idempotency";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8_000;
const CheckoutSchema = z.object({
  plan: z.string().refine(isBillingPlan, "Unsupported billing plan"),
  email: z.string().email().max(256).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const forbidden = requireRole(auth, "admin");
  if (forbidden) return forbidden;
  const invalidIdempotencyKey = validateIdempotencyKeyHeader(req);
  if (invalidIdempotencyKey) return invalidIdempotencyKey;

  const parsedBody = await readBoundedJsonBody(req, MAX_BODY_BYTES);
  if (parsedBody instanceof Response) return parsedBody;
  const parsed = CheckoutSchema.safeParse(parsedBody.body);
  if (!parsed.success) return err(parsed.error.issues.map((issue) => issue.message).join(", "), 422);

  if (process.env.BILLING_PROVIDER?.trim().toLowerCase() !== "stripe") {
    return err("Self-serve billing is not configured", 503);
  }

  const baseUrl = billingAppUrl();
  if (!baseUrl) return err("BILLING_APP_URL must be a valid HTTPS URL in production", 503);

  try {
    const session = await createStripeCheckoutSession({
      workspaceId: auth.workspace_id,
      plan: parsed.data.plan as BillingPlan,
      email: parsed.data.email,
      successUrl: `${baseUrl}/billing?checkout=success`,
      cancelUrl: `${baseUrl}/billing?checkout=cancelled`,
      idempotencyKey: req.headers.get("idempotency-key")?.trim() || undefined,
    });
    return json({ provider: "stripe", checkout_session_id: session.id, checkout_url: session.url }, 201);
  } catch (error) {
    console.error("[billing] Stripe checkout failed:", error);
    return err("Billing provider unavailable", 502);
  }
}
