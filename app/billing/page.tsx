"use client";

import Link from "next/link";
import { Sidebar } from "@/app/components/Sidebar";
import { AlertTriangle, CheckCircle2, CreditCard, Lock, Mail } from "lucide-react";

const PLANS = [
  {
    name: "Starter",
    status: "Private beta",
    price: "Free",
    features: [
      "Workspace API keys",
      "Payment intent verification",
      "Action security policies",
      "Monthly verification limits",
      "Dashboard, reviews, exports",
    ],
  },
  {
    name: "Pilot",
    status: "Manual approval",
    price: "Scoped",
    features: [
      "Webhook escalation",
      "SIEM export",
      "Pilot policy templates",
      "Shared launch checklist",
    ],
  },
  {
    name: "Enterprise",
    status: "Design partner",
    price: "Custom",
    features: [
      "Dedicated environment",
      "Longer audit retention",
      "Custom integrations",
      "Security review support",
    ],
  },
];

export default function BillingPage() {
  return (
    <div className="flex min-h-screen aurel-bg">
      <Sidebar />

      <main className="ml-64 flex-1 p-8">
        <div className="mx-auto max-w-6xl">
          <div className="aurel-kicker mb-3">Billing / beta access</div>
          <h1 className="aurel-title mb-2 text-4xl">Billing</h1>
          <p className="mb-8 max-w-3xl text-stone-400">
            Self-serve billing is not enabled in this build. Production pilots should be approved
            manually, then configured with scoped API keys, webhook/SIEM settings, and a signed audit policy.
          </p>

          <div className="mb-8 border border-amber-500/30 bg-amber-500/10 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" />
              <div>
                <h2 className="text-sm font-semibold text-amber-200">No automatic charges</h2>
                <p className="mt-1 text-sm leading-6 text-amber-100/70">
                  Upgrade and payment-method flows are disabled until a real billing provider is wired in.
                  Manual workspace status and verification limits are enforced from Settings until a provider owns subscription state.
                </p>
              </div>
            </div>
          </div>

          <div className="mb-8 grid border border-stone-800 md:grid-cols-3">
            {PLANS.map((plan) => (
              <article
                key={plan.name}
                className="border-b border-stone-800 bg-black/55 p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
              >
                <div className="mb-4 inline-flex border border-stone-700 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">
                  {plan.status}
                </div>
                <h2 className="text-xl font-semibold text-white">{plan.name}</h2>
                <div className="mt-3 text-3xl font-bold text-white">{plan.price}</div>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-stone-300">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
            <section className="aurel-panel p-6">
              <div className="mb-4 flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-stone-300" />
                <h2 className="text-lg font-semibold text-white">Payment method</h2>
              </div>
              <div className="border border-stone-800 bg-zinc-900/70 p-4">
                <div className="font-medium text-white">Not configured</div>
                <p className="mt-1 text-sm text-stone-400">
                  Add Stripe or another billing provider before enabling self-serve paid plan changes.
                  Until then, admins can suspend a workspace or set monthly verification limits in Settings.
                </p>
              </div>
            </section>

            <section className="aurel-panel p-6">
              <div className="mb-4 flex items-center gap-3">
                <Lock className="h-5 w-5 text-stone-300" />
                <h2 className="text-lg font-semibold text-white">Pilot setup</h2>
              </div>
              <div className="space-y-3">
                <Link href="/dashboard/api-keys" className="aurel-button-ghost flex items-center justify-center gap-2 px-4 py-3">
                  Manage API keys
                </Link>
                <Link href="/dashboard/settings" className="aurel-button-ghost flex items-center justify-center gap-2 px-4 py-3">
                  Apply pilot policy
                </Link>
                <Link href="/support" className="aurel-button flex items-center justify-center gap-2 px-4 py-3">
                  <Mail className="h-4 w-4" />
                  Request pilot approval
                </Link>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
