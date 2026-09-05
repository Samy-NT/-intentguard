"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/app/components/Sidebar";
import { apiKeyHeaders, getStoredApiKey, storeApiKey } from "../api-key";
import { CheckCircle2 } from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  role: "admin" | "operator" | "viewer";
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export default function ApiKeysPage() {
  const [apiKey, setApiKey] = useState("");
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyRole, setNewKeyRole] = useState<ApiKey["role"]>("operator");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadApiKeys = useCallback(async (key: string) => {
    if (!key.trim()) {
      setApiKeys([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/api-keys", { headers: apiKeyHeaders(key) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load API keys");
      setApiKeys(data.api_keys ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = getStoredApiKey();
    setApiKey(stored);
    void loadApiKeys(stored);
  }, [loadApiKeys]);

  async function handleCreateKey() {
    if (!newKeyName.trim() || !apiKey.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeaders(apiKey) },
        body: JSON.stringify({ name: newKeyName.trim(), role: newKeyRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create API key");

      setCreatedKey(data.raw_key);
      setNewKeyName("");
      setShowCreateModal(false);
      await loadApiKeys(apiKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create API key");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevokeKey(id: string) {
    if (!confirm("Revoke this API key? Existing integrations using it will stop working.")) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...apiKeyHeaders(apiKey) },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to revoke API key");
      await loadApiKeys(apiKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke API key");
    } finally {
      setSaving(false);
    }
  }

  const roleColors = {
    admin: "bg-red-500/20 text-red-400 border-red-500/30",
    operator: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    viewer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };

  return (
    <div className="flex min-h-screen flex-col aurel-bg lg:flex-row">
      <Sidebar />

      <main className="flex-1 p-4 sm:p-8 lg:ml-64">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">API Keys</h1>
              <p className="text-stone-400">Manage workspace API keys for authentication</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              disabled={!apiKey.trim() || saving}
              className="bg-stone-100 hover:bg-white disabled:bg-zinc-900 disabled:cursor-not-allowed text-black disabled:text-zinc-600 font-medium px-4 py-2  transition-colors"
            >
              + Create API Key
            </button>
          </div>

          <div className="aurel-panel p-4 mb-6">
            <label className="block text-sm font-medium text-stone-400 mb-2">Admin API key</label>
            <div className="flex gap-3">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  storeApiKey(e.target.value);
                }}
                placeholder="ig_live_..."
                className="flex-1 bg-zinc-800 border border-zinc-700  px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-stone-300"
              />
              <button
                onClick={() => loadApiKeys(apiKey)}
                disabled={!apiKey.trim() || loading}
                className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 font-medium px-4 py-2  transition-colors"
              >
                {loading ? "Loading..." : "Load"}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400  px-5 py-4 mb-6 text-sm">
              {error}
            </div>
          )}

          {createdKey && (
            <div className="bg-emerald-900/30 border border-emerald-500/50  p-4 mb-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-emerald-400 mb-1">API Key Created</h3>
                  <p className="text-sm text-stone-400 mb-2">Copy this key now. It will not be shown again.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-zinc-900 px-3 py-2 text-sm font-mono text-emerald-300 overflow-x-auto">
                      {createdKey}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(createdKey)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 text-sm transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <button onClick={() => setCreatedKey(null)} className="text-stone-400 hover:text-white">
                  x
                </button>
              </div>
            </div>
          )}

          <div className="aurel-panel overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="text-left text-sm font-medium text-stone-400 px-6 py-4">Name</th>
                  <th className="text-left text-sm font-medium text-stone-400 px-6 py-4">Role</th>
                  <th className="text-left text-sm font-medium text-stone-400 px-6 py-4">Status</th>
                  <th className="text-left text-sm font-medium text-stone-400 px-6 py-4">Last Used</th>
                  <th className="text-left text-sm font-medium text-stone-400 px-6 py-4">Created</th>
                  <th className="text-right text-sm font-medium text-stone-400 px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                      Loading API keys...
                    </td>
                  </tr>
                ) : apiKeys.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                      {apiKey.trim() ? "No API keys found." : "Enter an admin API key to load this workspace."}
                    </td>
                  </tr>
                ) : (
                  apiKeys.map((key) => (
                    <tr key={key.id} className="border-b border-stone-800/50 hover:bg-stone-950/30">
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{key.name}</div>
                        <div className="text-xs text-zinc-600 font-mono mt-1">{key.id}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs font-medium border ${roleColors[key.role]}`}>
                          {key.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`flex items-center gap-2 ${key.is_active ? "text-emerald-400" : "text-zinc-500"}`}>
                          <span className={`w-2 h-2  ${key.is_active ? "bg-emerald-400" : "bg-zinc-500"}`} />
                          {key.is_active ? "Active" : "Revoked"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-stone-400">
                        {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : "Never"}
                      </td>
                      <td className="px-6 py-4 text-sm text-stone-400">
                        {new Date(key.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {key.is_active && (
                          <button
                            onClick={() => handleRevokeKey(key.id)}
                            disabled={saving}
                            className="text-red-400 hover:text-red-300 disabled:text-zinc-600 text-sm transition-colors"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {showCreateModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="border border-stone-800 bg-zinc-950 p-6 w-full max-w-md">
                <h2 className="text-xl font-semibold text-white mb-4">Create API Key</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-400 mb-2">Name</label>
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g., Production API Key"
                      className="w-full bg-zinc-800 border border-zinc-700  px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-stone-300"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-400 mb-2">Role</label>
                    <select
                      value={newKeyRole}
                      onChange={(e) => setNewKeyRole(e.target.value as ApiKey["role"])}
                      className="w-full bg-zinc-800 border border-zinc-700  px-4 py-3 text-white focus:outline-none focus:border-stone-300"
                    >
                      <option value="admin">Admin - Full access</option>
                      <option value="operator">Operator - Review and manage</option>
                      <option value="viewer">Viewer - Read only</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 justify-end mt-6">
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setNewKeyName("");
                    }}
                    className="px-4 py-2 text-stone-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateKey}
                    disabled={saving || !newKeyName.trim()}
                    className="bg-stone-100 hover:bg-white disabled:bg-zinc-900 disabled:cursor-not-allowed text-black disabled:text-zinc-600 font-medium px-4 py-2  transition-colors"
                  >
                    {saving ? "Creating..." : "Create"}
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
