"use client";

import { useState } from "react";
import { Sidebar } from "@/app/components/Sidebar";
import { CreditCard } from "lucide-react";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "Free",
    period: "during beta",
    badge: "Private Beta",
    badgeColor: "bg-violet-500/15 text-violet-400",
    features: [
      "1,000 verifications / month",
      "3 defense layers",
      "API dashboard",
      "Community support",
      "Basic analytics",
    ],
    cta: "Current Plan",
    disabled: true,
  },
  {
    id: "growth",
    name: "Growth",
    price: "$149",
    period: "/ month",
    badge: "Popular",
    badgeColor: "bg-emerald-500/15 text-emerald-400",
    features: [
      "100,000 verifications / month",
      "3 defense layers",
      "Webhook escalation",
      "Policy editor",
      "Audit log export",
      "Priority support",
      "Custom rules",
    ],
    cta: "Upgrade",
    disabled: false,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "pricing",
    badge: "Contact Sales",
    badgeColor: "bg-amber-500/15 text-amber-400",
    features: [
      "Unlimited verifications",
      "Dedicated instance",
      "Custom rules engine",
      "SIEM integration",
      "SLA + dedicated support",
      "SSO/SAML",
      "Audit retention (90 days)",
      "Custom integrations",
    ],
    cta: "Contact Sales",
    disabled: false,
  },
];

export default function BillingPage() {
  const [currentPlan, setCurrentPlan] = useState("starter");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const handleUpgrade = (planId: string) => {
    setSelectedPlan(planId);
    setShowUpgradeModal(true);
  };

  return (
    <div className="flex min-h-screen bg-[#09090e]">
      <Sidebar />
      
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-2">Billing</h1>
          <p className="text-zinc-400 mb-8">Manage your subscription and payment methods</p>

          {/* Current Plan */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Current Plan: Starter</h2>
                <p className="text-zinc-400 text-sm">Free during beta period</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-white">Free</div>
                <div className="text-sm text-zinc-400">1,000 verifications/month</div>
              </div>
            </div>

            {/* Usage */}
            <div className="mt-6 pt-6 border-t border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-zinc-400">Monthly Usage</span>
                <span className="text-sm text-zinc-300">234 / 1,000 verifications</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full" style={{ width: "23.4%" }} />
              </div>
              <p className="text-xs text-zinc-500 mt-2">Resets on July 1, 2026</p>
            </div>
          </div>

          {/* Plans */}
          <h2 className="text-xl font-semibold text-white mb-6">Available Plans</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`bg-zinc-900/50 border rounded-xl p-6 ${
                  plan.id === currentPlan
                    ? "border-violet-500/50"
                    : "border-zinc-800 hover:border-zinc-700"
                }`}
              >
                {plan.badge && (
                  <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium mb-4 ${plan.badgeColor}`}>
                    {plan.badge}
                  </div>
                )}
                <h3 className="text-xl font-semibold text-white mb-2">{plan.name}</h3>
                <div className="mb-4">
                  <span className="text-3xl font-bold text-white">{plan.price}</span>
                  <span className="text-zinc-400 ml-1">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-zinc-300">
                      <span className="text-emerald-400 mt-0.5">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => !plan.disabled && handleUpgrade(plan.id)}
                  disabled={plan.disabled}
                  className={`w-full py-3 rounded-lg font-medium transition-colors ${
                    plan.disabled
                      ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                      : "bg-violet-600 hover:bg-violet-500 text-white"
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>

          {/* Payment Method */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Payment Method</h2>
            <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <CreditCard className="w-6 h-6 text-zinc-400" />
                <div>
                  <div className="text-white font-medium">No payment method on file</div>
                  <div className="text-sm text-zinc-400">Add a payment method to upgrade your plan</div>
                </div>
              </div>
              <button className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded-lg transition-colors">
                Add Payment Method
              </button>
            </div>
          </div>

          {/* Upgrade Modal */}
          {showUpgradeModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-md">
                <h2 className="text-xl font-semibold text-white mb-4">Upgrade Plan</h2>
                <p className="text-zinc-400 mb-6">
                  You are about to upgrade to the <span className="text-white font-medium">
                    {PLANS.find((p) => p.id === selectedPlan)?.name}
                  </span> plan.
                </p>
                <div className="bg-zinc-800/50 rounded-lg p-4 mb-6">
                  <div className="flex justify-between mb-2">
                    <span className="text-zinc-400">Plan</span>
                    <span className="text-white">{PLANS.find((p) => p.id === selectedPlan)?.name}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-zinc-400">Price</span>
                    <span className="text-white">
                      {PLANS.find((p) => p.id === selectedPlan)?.price}{" "}
                      {PLANS.find((p) => p.id === selectedPlan)?.period}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-zinc-700">
                    <span className="text-zinc-400 font-medium">Total</span>
                    <span className="text-white font-medium">
                      {PLANS.find((p) => p.id === selectedPlan)?.price}{" "}
                      {PLANS.find((p) => p.id === selectedPlan)?.period}
                    </span>
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      setShowUpgradeModal(false);
                      setSelectedPlan(null);
                    }}
                    className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setShowUpgradeModal(false);
                      setSelectedPlan(null);
                      setCurrentPlan(selectedPlan!);
                    }}
                    className="bg-violet-600 hover:bg-violet-500 text-white font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    Confirm Upgrade
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
