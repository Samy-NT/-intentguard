"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiKeyHeaders, storeApiKey } from "@/app/dashboard/api-key";
import { BookOpen, CheckCircle2, KeyRound, Lock, PlugZap, ShieldCheck } from "lucide-react";
import { AurelAuthHeader } from "@/app/components/AurelPublicShell";

const STEPS = [
  {
    id: "access",
    title: "Connect workspace access",
    description: "Use an existing admin or operator API key to scope this browser session.",
  },
  {
    id: "keys",
    title: "Create scoped keys",
    description: "Generate separate operator and viewer keys from the real API key manager.",
  },
  {
    id: "policy",
    title: "Apply a pilot policy",
    description: "Pick a policy profile and tune recipients, categories, tools, webhooks, and audit settings.",
  },
  {
    id: "test",
    title: "Run a protected action",
    description: "Send a verification request and confirm the signed audit record appears in the dashboard.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  async function connectKey() {
    if (!apiKey.trim()) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/settings", { headers: apiKeyHeaders(apiKey) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      storeApiKey(apiKey);
      setConnected(true);
      setCurrentStep(1);
    } catch (e) {
      setConnected(false);
      setError(e instanceof Error ? e.message : "Invalid API key");
    } finally {
      setChecking(false);
    }
  }

  function next() {
    if (currentStep < STEPS.length - 1) setCurrentStep((step) => step + 1);
    else router.push("/dashboard");
  }

  function back() {
    setCurrentStep((step) => Math.max(0, step - 1));
  }

  return (
    <div className="aurel-bg min-h-screen">
      <AurelAuthHeader />
      <div className="flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-3xl">
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center border font-mono text-sm font-bold ${
                    index <= currentStep ? "border-stone-100 bg-stone-100 text-black" : "border-zinc-800 bg-zinc-900 text-zinc-500"
                  }`}
                >
                  {index < currentStep ? "✓" : index + 1}
                </div>
                {index < STEPS.length - 1 && (
                  <div className={`mx-2 h-px w-16 ${index < currentStep ? "bg-stone-100" : "bg-zinc-800"}`} />
                )}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs text-zinc-500">
            {STEPS.map((step, index) => (
              <span key={step.id} className={currentStep === index ? "text-stone-200" : ""}>
                {step.title}
              </span>
            ))}
          </div>
        </div>

        <div className="aurel-panel p-8">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center border border-stone-700 bg-stone-950">
              {currentStep === 0 && <KeyRound className="h-5 w-5 text-stone-300" />}
              {currentStep === 1 && <Lock className="h-5 w-5 text-stone-300" />}
              {currentStep === 2 && <ShieldCheck className="h-5 w-5 text-stone-300" />}
              {currentStep === 3 && <PlugZap className="h-5 w-5 text-stone-300" />}
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-stone-100">{STEPS[currentStep].title}</h1>
              <p className="mt-2 text-stone-400">{STEPS[currentStep].description}</p>
            </div>
          </div>

          {currentStep === 0 && (
            <div className="space-y-4">
              {error && <div className="border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-stone-400">Workspace API key</span>
                <input
                  id="onboarding-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="ig_live_..."
                  className="aurel-field w-full px-4 py-3 placeholder-zinc-500"
                  autoFocus
                />
              </label>
              <button
                type="button"
                onClick={connectKey}
                disabled={!apiKey.trim() || checking}
                className="aurel-button w-full py-3 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {checking ? "Checking..." : "Connect workspace"}
              </button>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  {connected ? "Workspace key verified" : "Use the stored workspace key"}
                </div>
                <p className="mt-2 text-sm leading-6 text-stone-400">
                  Create a dedicated operator key for integrations and keep admin keys for policy and key management only.
                </p>
              </div>
              <Link href="/dashboard/api-keys" className="aurel-button flex justify-center px-4 py-3">
                Open API key manager
              </Link>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-stone-400">
                Settings now includes pilot templates and action-security controls for tool preflight.
                Apply one template, then tune recipients, categories, webhooks, SIEM, and retention.
              </p>
              <Link href="/dashboard/settings" className="aurel-button flex justify-center px-4 py-3">
                Open policy settings
              </Link>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="overflow-x-auto border border-stone-800 bg-black p-4">
                <pre className="font-mono text-sm text-zinc-300">
                  <code>{`curl -X POST http://localhost:3000/api/v1/verify \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_OPERATOR_KEY" \\
  -d '{
    "intent_id": "smoke_001",
    "agent_id": "ag_finance_ops",
    "amount": 250,
    "currency": "USD",
    "recipient": "billing@stripe.com",
    "agent_context": "Renewing approved SaaS subscription.",
    "mission_scope": "Manage SaaS software subscriptions"
  }'`}</code>
                </pre>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/dashboard" className="aurel-button flex flex-1 justify-center px-4 py-3">
                  Open dashboard
                </Link>
                <Link href="/docs" className="aurel-button-ghost flex flex-1 items-center justify-center gap-2 px-4 py-3">
                  <BookOpen className="h-4 w-4" />
                  Read docs
                </Link>
              </div>
            </div>
          )}

          <div className="mt-8 flex justify-between border-t border-stone-800 pt-6">
            <button
              type="button"
              onClick={back}
              disabled={currentStep === 0}
              className="px-4 py-2 text-stone-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={next}
              disabled={currentStep === 0 && !connected}
              className="aurel-button px-6 py-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {currentStep === STEPS.length - 1 ? "Go to Dashboard" : "Next"}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="mt-4 w-full text-sm text-zinc-500 transition-colors hover:text-zinc-400"
        >
          Skip onboarding
        </button>
      </div>
      </div>
    </div>
  );
}
