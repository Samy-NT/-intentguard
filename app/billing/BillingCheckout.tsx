"use client";

import { useState } from "react";
import { Loader2, RefreshCw, ShoppingCart } from "lucide-react";
import { apiKeyHeaders, getStoredApiKey } from "@/app/dashboard/api-key";

const PLANS = [
  { value: "starter", label: "Starter" },
  { value: "pilot", label: "Pilot" },
  { value: "enterprise", label: "Enterprise" },
] as const;

export function BillingCheckout() {
  const [plan, setPlan] = useState("pilot");
  const [loading, setLoading] = useState<"checkout" | "portal" | "reconcile" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function authHeaders(): Record<string, string> {
    return apiKeyHeaders(getStoredApiKey()) as Record<string, string>;
  }

  async function startCheckout() {
    setLoading("checkout");
    setMessage(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ plan }),
      });
      const body = (await response.json().catch(() => null)) as { checkout_url?: string; error?: string } | null;
      if (!response.ok || !body?.checkout_url) {
        setMessage(body?.error ?? "Billing is not configured for this workspace.");
        return;
      }
      window.location.assign(body.checkout_url);
    } catch {
      setMessage("Unable to contact the billing provider.");
    } finally {
      setLoading(null);
    }
  }

  async function openPortal() {
    setLoading("portal");
    setMessage(null);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST", headers: authHeaders() });
      const body = (await response.json().catch(() => null)) as { portal_url?: string; error?: string } | null;
      if (!response.ok || !body?.portal_url) {
        setMessage(body?.error ?? "No billing portal is available for this workspace yet.");
        return;
      }
      window.location.assign(body.portal_url);
    } catch {
      setMessage("Unable to contact the billing provider.");
    } finally {
      setLoading(null);
    }
  }

  async function reconcileBilling() {
    setLoading("reconcile");
    setMessage(null);
    try {
      const response = await fetch("/api/billing/reconcile", { method: "POST", headers: authHeaders() });
      const body = (await response.json().catch(() => null)) as {
        workspace_status?: string;
        billing_plan?: string | null;
        duplicate?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !body?.workspace_status) {
        setMessage(body?.error ?? "Billing reconciliation is not available for this workspace yet.");
        return;
      }
      const planLabel = body.billing_plan ? ` on ${body.billing_plan}` : "";
      setMessage(`Stripe billing is synced${planLabel}; workspace is ${body.workspace_status}${body.duplicate ? " (already current)" : ""}.`);
    } catch {
      setMessage("Unable to reconcile billing with the provider.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="border border-stone-800 bg-zinc-900/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm text-stone-300">
          Plan
          <select value={plan} onChange={(event) => setPlan(event.target.value)} className="mt-2 block w-full border border-stone-700 bg-black px-3 py-2 text-sm text-white">
            {PLANS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={startCheckout} disabled={loading !== null} className="aurel-button flex items-center justify-center gap-2 px-4 py-3 disabled:opacity-50">
          {loading === "checkout" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
          Continue to checkout
        </button>
        <button type="button" onClick={openPortal} disabled={loading !== null} className="aurel-button-ghost px-4 py-3 disabled:opacity-50">
          {loading === "portal" ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null} Manage billing
        </button>
        <button type="button" onClick={reconcileBilling} disabled={loading !== null} className="aurel-button-ghost flex items-center justify-center gap-2 px-4 py-3 disabled:opacity-50">
          {loading === "reconcile" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sync
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-amber-300">{message}</p> : null}
    </div>
  );
}
