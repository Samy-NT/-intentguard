import type { Metadata } from "next";
import { AurelGridSection, AurelPublicHeader, AurelPublicMain } from "@/app/components/AurelPublicShell";

export const metadata: Metadata = {
  title: "API Reference",
  description:
    "Aurels API reference for verifying autonomous action intent before execution.",
  alternates: {
    canonical: "/api-reference",
  },
};

export default function ApiReferencePage() {
  return (
    <AurelPublicMain>
      <AurelPublicHeader eyebrow="API / pre-execution verdict" title="Aurels API reference">
        Use Aurels to verify intent before an autonomous agent executes a high-consequence action.
        The API returns a decision, risk score, triggered layer, and signed audit data.
      </AurelPublicHeader>

      <AurelGridSection>
        <section className="border-b border-stone-800 pb-10">
          <h2 className="text-2xl font-black uppercase tracking-tight text-stone-100">POST /api/v1/verify</h2>
          <p className="mt-3 text-stone-400">
            Authenticates with the <code className="text-stone-200">x-api-key</code> header.
            Use this endpoint before passing an agent decision into a downstream tool. Payments are the first supported example.
          </p>
          <pre className="mt-6 overflow-x-auto border border-stone-800 bg-black p-5 font-mono text-sm text-stone-200">{`curl -X POST https://aurels.dev/api/v1/verify \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "intent_id": "act_2026_0001",
    "agent_id": "ag_expense_manager_v1",
    "amount": 250,
    "currency": "USD",
    "recipient": "billing@stripe.com",
    "agent_context": "Renewing approved SaaS subscription.",
    "mission_scope": "Manage SaaS renewals up to $500/month",
    "metadata": { "action_type": "payment" }
  }'`}</pre>
        </section>

        <section className="mt-10 border-b border-stone-800 pb-10">
          <h2 className="text-2xl font-black uppercase tracking-tight text-stone-100">Response</h2>
          <pre className="mt-6 overflow-x-auto border border-stone-800 bg-black p-5 font-mono text-sm text-stone-200">{`{
  "intent_id": "act_2026_0001",
  "decision": "allow",
  "reason": "All verification layers passed",
  "risk_score": 5,
  "triggered_rule": null,
  "evaluated_at": "2026-07-11T12:00:00.000Z",
  "audit_signature": "8f1c...",
  "audit_signature_version": "audit-v1-hmac-sha256"
}`}</pre>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-black uppercase tracking-tight text-stone-100">Decision values</h2>
          <dl className="mt-6 grid border border-stone-800 md:grid-cols-3">
            <div className="border-b border-stone-800 p-5 md:border-b-0 md:border-r">
              <dt className="font-mono text-sm font-bold text-emerald-400">allow</dt>
              <dd className="mt-2 text-stone-400">The action can proceed.</dd>
            </div>
            <div className="border-b border-stone-800 p-5 md:border-b-0 md:border-r">
              <dt className="font-mono text-sm font-bold text-amber-300">flag</dt>
              <dd className="mt-2 text-stone-400">The action requires review or escalation.</dd>
            </div>
            <div className="p-5">
              <dt className="font-mono text-sm font-bold text-red-400">block</dt>
              <dd className="mt-2 text-stone-400">The action should not execute.</dd>
            </div>
          </dl>
        </section>

        <section className="mt-10 border-t border-stone-800 pt-10">
          <h2 className="text-2xl font-black uppercase tracking-tight text-stone-100">POST /api/v1/mandates</h2>
          <p className="mt-3 text-stone-400">
            Issues a signed mandate that constrains a later verification request to a mission scope,
            expiry, amount, recipient, merchant, category, and optional agent.
          </p>
          <pre className="mt-6 overflow-x-auto border border-stone-800 bg-black p-5 font-mono text-sm text-stone-200">{`curl -X POST https://aurels.dev/api/v1/mandates \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_OPERATOR_KEY" \\
  -d '{
    "expires_at": "2026-09-02T10:00:00.000Z",
    "mission_scope": "Manage approved SaaS renewals",
    "agent_id": "ag_expense_manager_v1",
            "max_amount": 500,
            "currency": "USD",
            "allowed_recipients": ["billing@stripe.com"],
            "allowed_merchants": ["stripe"],
            "allowed_categories": ["saas"],
            "ap2": {
              "protocol_version": "v0.2",
              "mode": "human_not_present",
              "vct": "mandate.payment.open.1",
              "checkout_hash": "merchant-checkout-hash",
              "transaction_id": "payment-transaction-id"
            }
  }'`}</pre>
          <p className="mt-3 text-sm text-stone-500">
            When AP2 bindings are present, verification requests must include matching
            <code className="mx-1 text-stone-300">metadata.checkout_hash</code>
            and/or <code className="mx-1 text-stone-300">metadata.transaction_id</code>.
          </p>
        </section>
      </AurelGridSection>
    </AurelPublicMain>
  );
}
