"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw, ScrollText, Trash2 } from "lucide-react";
import { Sidebar } from "@/app/components/Sidebar";
import { apiKeyHeaders, getStoredApiKey, storeApiKey } from "@/app/dashboard/api-key";

interface MandateRow {
  id: string;
  mandate_id: string;
  payload: {
    mandate_id: string;
    workspace_id: string;
    issued_at: string;
    expires_at: string;
    mission_scope: string;
    agent_id?: string;
    max_amount?: number;
    currency?: string;
    allowed_recipients?: string[];
    allowed_merchants?: string[];
    allowed_categories?: string[];
  };
  signature: string;
  signature_version: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

const DEFAULT_EXPIRES_AT = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

function splitList(value: string): string[] | undefined {
  const entries = value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return entries.length ? entries : undefined;
}

function toSignedMandate(row: MandateRow) {
  return {
    payload: row.payload,
    signature: row.signature,
    signature_version: row.signature_version,
  };
}

export default function MandatesPage() {
  const [apiKey, setApiKey] = useState("");
  const [mandates, setMandates] = useState<MandateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<MandateRow | null>(null);
  const [form, setForm] = useState({
    mission_scope: "Manage approved SaaS renewals",
    expires_at: DEFAULT_EXPIRES_AT(),
    agent_id: "",
    max_amount: "500",
    currency: "USD",
    allowed_recipients: "billing@stripe.com",
    allowed_merchants: "stripe",
    allowed_categories: "saas",
  });

  const createdJson = useMemo(() => (created ? JSON.stringify(toSignedMandate(created), null, 2) : ""), [created]);

  const loadMandates = useCallback(async (key = apiKey) => {
    if (!key.trim()) {
      setMandates([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/mandates", { headers: apiKeyHeaders(key) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMandates(data.mandates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load mandates");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    const stored = getStoredApiKey();
    setApiKey(stored);
    void loadMandates(stored);
  }, [loadMandates]);

  async function createMandate() {
    setSaving(true);
    setError(null);
    setCreated(null);
    try {
      const expiresAt = new Date(form.expires_at).toISOString();
      const body = {
        mission_scope: form.mission_scope.trim(),
        expires_at: expiresAt,
        agent_id: form.agent_id.trim() || undefined,
        max_amount: form.max_amount ? Number(form.max_amount) : undefined,
        currency: form.currency.trim() || undefined,
        allowed_recipients: splitList(form.allowed_recipients),
        allowed_merchants: splitList(form.allowed_merchants),
        allowed_categories: splitList(form.allowed_categories),
      };

      const res = await fetch("/api/v1/mandates", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeaders(apiKey) },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCreated(data.mandate);
      setToast("Mandate issued");
      await loadMandates();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to issue mandate");
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 2500);
    }
  }

  async function revokeMandate(mandateId: string) {
    if (!confirm("Revoke this mandate? Future verifications using it will be blocked.")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/mandates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...apiKeyHeaders(apiKey) },
        body: JSON.stringify({ mandate_id: mandateId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setToast("Mandate revoked");
      await loadMandates();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke mandate");
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 2500);
    }
  }

  return (
    <div className="flex min-h-screen flex-col aurel-bg lg:flex-row">
      <Sidebar />

      <main className="flex-1 p-4 sm:p-8 lg:ml-64">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="aurel-kicker mb-3">Mandates / signed authorization</div>
              <h1 className="aurel-title text-4xl">Mandates</h1>
              <p className="mt-2 max-w-3xl text-stone-400">
                Issue a signed instruction envelope, then include it in verification requests to bind
                payments to mission scope, expiry, amount, merchant, recipient, and category constraints.
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
                className="w-72 border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-stone-500"
              />
              <button
                type="button"
                onClick={() => loadMandates()}
                disabled={loading || !apiKey.trim()}
                className="border border-stone-800 bg-zinc-900 px-3 py-2 text-sm text-stone-300 transition-colors hover:border-stone-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </header>

          {error && <div className="border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
          {toast && <div className="fixed bottom-6 right-6 z-50 border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-300">{toast}</div>}

          <div className="grid gap-6 xl:grid-cols-[0.85fr_1fr]">
            <section className="aurel-panel p-6">
              <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold text-white">
                <ScrollText className="h-5 w-5 text-stone-300" />
                Issue mandate
              </h2>
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-zinc-600">Mission scope</span>
                  <textarea
                    value={form.mission_scope}
                    onChange={(e) => setForm({ ...form, mission_scope: e.target.value })}
                    rows={3}
                    className="w-full resize-none border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-stone-500"
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-zinc-600">Expires</span>
                    <input
                      type="datetime-local"
                      value={form.expires_at}
                      onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                      className="w-full border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-stone-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-zinc-600">Max amount</span>
                    <input
                      type="number"
                      min={1}
                      value={form.max_amount}
                      onChange={(e) => setForm({ ...form, max_amount: e.target.value })}
                      className="w-full border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-stone-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-zinc-600">Currency</span>
                    <input
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value })}
                      className="w-full border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-stone-500"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-zinc-600">Agent ID</span>
                  <input
                    value={form.agent_id}
                    onChange={(e) => setForm({ ...form, agent_id: e.target.value })}
                    placeholder="Optional"
                    className="w-full border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-stone-500"
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-zinc-600">Recipients</span>
                    <textarea
                      value={form.allowed_recipients}
                      onChange={(e) => setForm({ ...form, allowed_recipients: e.target.value })}
                      rows={4}
                      className="w-full resize-none border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-stone-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-zinc-600">Merchants</span>
                    <textarea
                      value={form.allowed_merchants}
                      onChange={(e) => setForm({ ...form, allowed_merchants: e.target.value })}
                      rows={4}
                      className="w-full resize-none border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-stone-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-zinc-600">Categories</span>
                    <textarea
                      value={form.allowed_categories}
                      onChange={(e) => setForm({ ...form, allowed_categories: e.target.value })}
                      rows={4}
                      className="w-full resize-none border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-stone-500"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={createMandate}
                  disabled={saving || !apiKey.trim() || !form.mission_scope.trim() || !form.expires_at}
                  className="aurel-button w-full justify-center px-4 py-3 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Issuing..." : "Issue signed mandate"}
                </button>
              </div>
            </section>

            <section className="space-y-6">
              {created && (
                <div className="aurel-panel p-6">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <h2 className="text-lg font-semibold text-white">Created mandate</h2>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(createdJson)}
                      className="inline-flex items-center gap-2 border border-stone-800 px-3 py-2 text-xs text-stone-300 transition-colors hover:border-stone-500"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy JSON
                    </button>
                  </div>
                  <pre className="max-h-80 overflow-auto border border-stone-800 bg-black p-4 text-xs leading-relaxed text-stone-300">
                    <code>{createdJson}</code>
                  </pre>
                </div>
              )}

              <div className="aurel-panel overflow-hidden">
                <div className="border-b border-stone-800 px-5 py-4">
                  <h2 className="text-lg font-semibold text-white">Active registry</h2>
                </div>
                <div className="divide-y divide-stone-800">
                  {loading ? (
                    <div className="p-10 text-center text-sm text-zinc-500">Loading mandates...</div>
                  ) : mandates.length === 0 ? (
                    <div className="p-10 text-center text-sm text-zinc-500">
                      {apiKey.trim() ? "No active mandates." : "Enter an API key to load mandates."}
                    </div>
                  ) : (
                    mandates.map((mandate) => (
                      <div key={mandate.id} className="flex items-start justify-between gap-4 p-5">
                        <div className="min-w-0">
                          <div className="font-mono text-xs text-stone-300">{mandate.mandate_id}</div>
                          <div className="mt-2 text-sm text-white">{mandate.payload.mission_scope}</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
                            <span>expires {new Date(mandate.expires_at).toLocaleString()}</span>
                            {mandate.payload.agent_id && <span>agent {mandate.payload.agent_id}</span>}
                            {mandate.payload.max_amount && <span>cap {mandate.payload.max_amount} {mandate.payload.currency ?? ""}</span>}
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(JSON.stringify(toSignedMandate(mandate), null, 2))}
                            className="border border-stone-800 p-2 text-stone-400 transition-colors hover:border-stone-500 hover:text-white"
                            title="Copy signed mandate"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => revokeMandate(mandate.mandate_id)}
                            disabled={saving}
                            className="border border-red-500/30 p-2 text-red-400 transition-colors hover:border-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Revoke mandate"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
