"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/app/components/Sidebar";
import { apiKeyHeaders, getStoredApiKey, storeApiKey } from "@/app/dashboard/api-key";
import { Building2, KeyRound, ShieldCheck } from "lucide-react";

interface WorkspaceSettings {
  webhook_url?: string;
  webhook_threshold?: number;
  semantic_fail_mode?: "allow" | "flag" | "block";
}

export default function WorkspacesPage() {
  const [apiKey, setApiKey] = useState("");
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async (key = apiKey) => {
    if (!key.trim()) {
      setSettings(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/settings", { headers: apiKeyHeaders(key) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSettings(data.settings ?? {});
    } catch (e) {
      setSettings(null);
      setError(e instanceof Error ? e.message : "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    const stored = getStoredApiKey();
    setApiKey(stored);
    void loadWorkspace(stored);
  }, [loadWorkspace]);

  return (
    <div className="flex min-h-screen aurel-bg">
      <Sidebar />

      <main className="ml-64 flex-1 p-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="aurel-kicker mb-3">Workspace / access</div>
              <h1 className="text-3xl font-bold text-white">Workspace</h1>
              <p className="mt-2 max-w-2xl text-stone-400">
                Dashboard access is scoped through the API key you provide. Multi-workspace account
                management should be added with first-party user auth before self-serve launch.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  storeApiKey(e.target.value);
                }}
                placeholder="ig_live_..."
                className="w-64 border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-stone-500"
              />
              <button
                type="button"
                onClick={() => loadWorkspace()}
                disabled={!apiKey.trim() || loading}
                className="bg-stone-100 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-900 disabled:text-zinc-600"
              >
                {loading ? "Loading..." : "Load"}
              </button>
            </div>
          </div>

          {error && <div className="mb-6 border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="aurel-panel p-5">
              <Building2 className="mb-4 h-5 w-5 text-stone-300" />
              <div className="text-xs uppercase tracking-[0.18em] text-zinc-600">Scope</div>
              <div className="mt-2 text-lg font-semibold text-white">
                {settings ? "Current API-key workspace" : "No workspace loaded"}
              </div>
            </div>
            <div className="aurel-panel p-5">
              <ShieldCheck className="mb-4 h-5 w-5 text-stone-300" />
              <div className="text-xs uppercase tracking-[0.18em] text-zinc-600">Semantic fail mode</div>
              <div className="mt-2 text-lg font-semibold text-white">{settings?.semantic_fail_mode ?? "-"}</div>
            </div>
            <div className="aurel-panel p-5">
              <KeyRound className="mb-4 h-5 w-5 text-stone-300" />
              <div className="text-xs uppercase tracking-[0.18em] text-zinc-600">Webhook</div>
              <div className="mt-2 text-lg font-semibold text-white">{settings?.webhook_url ? "Configured" : "Not configured"}</div>
            </div>
          </div>

          <div className="mt-6 aurel-panel p-6">
            <h2 className="text-lg font-semibold text-white">Production workspace checklist</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {[
                ["Create separate admin and operator keys", "/dashboard/api-keys"],
                ["Apply a pilot policy template", "/dashboard/settings"],
                ["Configure webhook and SIEM delivery", "/dashboard/integrations"],
                ["Verify signed audit logs", "/dashboard/audit"],
              ].map(([label, href]) => (
                <Link
                  key={label}
                  href={href}
                  className="border border-stone-800 bg-black/40 p-4 text-sm text-stone-300 transition-colors hover:border-stone-500"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
