"use client";

import { useState } from "react";
import { Sidebar } from "@/app/components/Sidebar";
import { CheckCircle2 } from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  key: string;
  role: "admin" | "operator" | "viewer";
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([
    {
      id: "1",
      name: "Production API Key",
      key: "ig_prod_abc123xyz789",
      role: "admin",
      is_active: true,
      created_at: "2026-01-15T10:30:00Z",
      last_used_at: "2026-06-26T12:00:00Z",
    },
    {
      id: "2",
      name: "Development Key",
      key: "ig_dev_def456uvw012",
      role: "operator",
      is_active: true,
      created_at: "2026-02-01T14:20:00Z",
      last_used_at: "2026-06-25T09:30:00Z",
    },
  ]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyRole, setNewKeyRole] = useState<"admin" | "operator" | "viewer">("operator");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const handleCreateKey = () => {
    if (!newKeyName.trim()) return;

    const newKey = `ig_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    
    const apiKey: ApiKey = {
      id: Date.now().toString(),
      name: newKeyName,
      key: newKey,
      role: newKeyRole,
      is_active: true,
      created_at: new Date().toISOString(),
      last_used_at: null,
    };

    setApiKeys([...apiKeys, apiKey]);
    setCreatedKey(newKey);
    setNewKeyName("");
    setShowCreateModal(false);
  };

  const handleRevokeKey = (id: string) => {
    setApiKeys(apiKeys.map((key) => (key.id === id ? { ...key, is_active: false } : key)));
  };

  const handleActivateKey = (id: string) => {
    setApiKeys(apiKeys.map((key) => (key.id === id ? { ...key, is_active: true } : key)));
  };

  const roleColors = {
    admin: "bg-red-500/20 text-red-400 border-red-500/30",
    operator: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    viewer: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };

  return (
    <div className="flex min-h-screen bg-[#09090e]">
      <Sidebar />
      
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">API Keys</h1>
              <p className="text-zinc-400">Manage your API keys for authentication</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-violet-600 hover:bg-violet-500 text-white font-medium px-4 py-2 rounded-lg transition-colors"
            >
              + Create API Key
            </button>
          </div>

          {/* Created Key Alert */}
          {createdKey && (
            <div className="bg-emerald-900/30 border border-emerald-500/50 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-emerald-400 mb-1">API Key Created</h3>
                  <p className="text-sm text-zinc-400 mb-2">Copy this key now. You won&apos;t be able to see it again.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-zinc-900 px-3 py-2 rounded text-sm font-mono text-emerald-300">
                      {createdKey}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(createdKey);
                        alert("Copied to clipboard!");
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded text-sm transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setCreatedKey(null)}
                  className="text-zinc-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* API Keys Table */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-sm font-medium text-zinc-400 px-6 py-4">Name</th>
                  <th className="text-left text-sm font-medium text-zinc-400 px-6 py-4">Key</th>
                  <th className="text-left text-sm font-medium text-zinc-400 px-6 py-4">Role</th>
                  <th className="text-left text-sm font-medium text-zinc-400 px-6 py-4">Status</th>
                  <th className="text-left text-sm font-medium text-zinc-400 px-6 py-4">Last Used</th>
                  <th className="text-left text-sm font-medium text-zinc-400 px-6 py-4">Created</th>
                  <th className="text-right text-sm font-medium text-zinc-400 px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((apiKey) => (
                  <tr key={apiKey.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{apiKey.name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-sm font-mono text-zinc-400">
                        {apiKey.key.substring(0, 12)}...
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${roleColors[apiKey.role]}`}>
                        {apiKey.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`flex items-center gap-2 ${apiKey.is_active ? "text-emerald-400" : "text-zinc-500"}`}>
                        <span className={`w-2 h-2 rounded-full ${apiKey.is_active ? "bg-emerald-400" : "bg-zinc-500"}`} />
                        {apiKey.is_active ? "Active" : "Revoked"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-400">
                      {apiKey.last_used_at
                        ? new Date(apiKey.last_used_at).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-400">
                      {new Date(apiKey.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {apiKey.is_active ? (
                        <button
                          onClick={() => handleRevokeKey(apiKey.id)}
                          className="text-red-400 hover:text-red-300 text-sm transition-colors"
                        >
                          Revoke
                        </button>
                      ) : (
                        <button
                          onClick={() => handleActivateKey(apiKey.id)}
                          className="text-emerald-400 hover:text-emerald-300 text-sm transition-colors"
                        >
                          Activate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Create Modal */}
          {showCreateModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-md">
                <h2 className="text-xl font-semibold text-white mb-4">Create API Key</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Name</label>
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g., Production API Key"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Role</label>
                    <select
                      value={newKeyRole}
                      onChange={(e) => setNewKeyRole(e.target.value as "admin" | "operator" | "viewer")}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="admin">Admin - Full access</option>
                      <option value="operator">Operator - Review & manage</option>
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
                    className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateKey}
                    className="bg-violet-600 hover:bg-violet-500 text-white font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    Create
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
