import { type NextRequest } from "next/server";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { billingAppUrl, createStripeBillingPortalSession } from "@/lib/billing/stripe";
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

  const baseUrl = billingAppUrl();
  if (!baseUrl) return err("BILLING_APP_URL must be a valid HTTPS URL in production", 503);

  const { data, error } = await auth.db
    .from("workspaces")
    .select("policy")
    .eq("id", auth.workspace_id)
    .maybeSingle();
  if (error) return err("Unable to load billing customer", 503);
  const policy = data?.policy && typeof data.policy === "object" ? data.policy as Record<string, unknown> : {};
  const customerId = typeof policy.billing_customer_id === "string" ? policy.billing_customer_id.trim() : "";
  if (!customerId) return err("No Stripe customer is linked to this workspace yet", 409);

  try {
    const session = await createStripeBillingPortalSession({
      customerId,
      returnUrl: `${baseUrl}/billing`,
    });
    return json({ provider: "stripe", portal_session_id: session.id, portal_url: session.url });
  } catch (error) {
    console.error("[billing] Stripe portal failed:", error);
    return err("Billing provider unavailable", 502);
  }
}
