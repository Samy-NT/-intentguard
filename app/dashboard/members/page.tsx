"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/app/components/Sidebar";
import { getStoredApiKey } from "@/app/dashboard/api-key";
import {
  type DashboardMember,
  type DashboardMemberRole,
  deactivateWorkspaceMember,
  inviteWorkspaceMember,
  listWorkspaceMembers,
} from "@/lib/dashboard-members";

const roleColors: Record<DashboardMemberRole, string> = {
  admin: "border-red-500/30 bg-red-500/20 text-red-300",
  operator: "border-amber-500/30 bg-amber-500/20 text-amber-300",
  viewer: "border-blue-500/30 bg-blue-500/20 text-blue-300",
};

const formatDate = (value?: string): string => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
};

export default function MembersPage() {
  const [apiKey, setApiKey] = useState("");
  const [members, setMembers] = useState<DashboardMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<DashboardMemberRole>("operator");

  const activeMembers = useMemo(() => members.filter((member) => member.is_active), [members]);

  const loadMembers = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      setMembers(await listWorkspaceMembers(key));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace members");
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = getStoredApiKey();
    setApiKey(stored);
    void loadMembers(stored);
  }, [loadMembers]);

  const handleInvite = async () => {
    const trimmedEmail = email.trim();
    const trimmedUserId = userId.trim();
    if (!trimmedEmail && !trimmedUserId) {
      setError("Enter an email invite or an existing Supabase user id.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await inviteWorkspaceMember(apiKey, {
        ...(trimmedEmail ? { email: trimmedEmail } : { user_id: trimmedUserId }),
        role,
      });
      setEmail("");
      setUserId("");
      setRole("operator");
      setNotice(trimmedEmail ? `Invite sent to ${trimmedEmail}.` : "Workspace member linked.");
      await loadMembers(apiKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite workspace member");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (member: DashboardMember) => {
    if (!confirm("Deactivate this dashboard member? They will lose dashboard access for this workspace.")) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await deactivateWorkspaceMember(apiKey, member.user_id);
      setNotice("Dashboard access deactivated.");
      await loadMembers(apiKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate workspace member");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col aurel-bg lg:flex-row">
      <Sidebar />

      <main className="flex-1 p-4 sm:p-8 lg:ml-64">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-stone-500">Access / Supabase Auth</p>
              <h1 className="mt-2 text-3xl font-bold text-white">Workspace Members</h1>
              <p className="mt-2 max-w-2xl text-stone-400">
                Invite human operators into this workspace. API keys remain for agent integrations;
                dashboard access is backed by Supabase Auth plus an active workspace role.
              </p>
            </div>
            <button
              onClick={() => loadMembers(apiKey)}
              disabled={loading || saving}
              className="border border-stone-700 px-4 py-2 text-sm font-medium text-stone-200 transition-colors hover:border-stone-500 hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <section className="aurel-panel mb-6 p-5">
            <h2 className="text-lg font-semibold text-white">Invite or link a member</h2>
            <p className="mt-1 text-sm text-stone-500">
              Use an email to send a Supabase invite, or paste an existing Supabase user id to link an already-created account.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_180px_auto]">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ops@example.com"
                className="border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 focus:border-stone-300 focus:outline-none"
              />
              <input
                type="text"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder="or Supabase user id"
                className="border border-zinc-700 bg-zinc-900 px-4 py-3 font-mono text-sm text-white placeholder-zinc-500 focus:border-stone-300 focus:outline-none"
              />
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as DashboardMemberRole)}
                className="border border-zinc-700 bg-zinc-900 px-4 py-3 text-white focus:border-stone-300 focus:outline-none"
              >
                <option value="admin">Admin</option>
                <option value="operator">Operator</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                onClick={handleInvite}
                disabled={saving || (!email.trim() && !userId.trim())}
                className="bg-stone-100 px-5 py-3 font-medium text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-900 disabled:text-zinc-600"
              >
                {saving ? "Saving..." : "Add member"}
              </button>
            </div>
          </section>

          {error && <div className="mb-6 border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">{error}</div>}
          {notice && (
            <div className="mb-6 border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-300">
              {notice}
            </div>
          )}

          <section className="aurel-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-stone-800 px-6 py-4">
              <div>
                <h2 className="font-semibold text-white">Active members</h2>
                <p className="text-sm text-stone-500">{activeMembers.length} active dashboard operator(s)</p>
              </div>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-800 text-left text-sm font-medium text-stone-400">
                  <th className="px-6 py-4">Supabase user id</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Created</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                      Loading workspace members...
                    </td>
                  </tr>
                ) : members.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                      No dashboard members found. Invite the first operator above.
                    </td>
                  </tr>
                ) : (
                  members.map((member) => (
                    <tr key={member.user_id} className="border-b border-stone-800/50 hover:bg-stone-950/30">
                      <td className="px-6 py-4">
                        <code className="font-mono text-xs text-stone-300">{member.user_id}</code>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`border px-2 py-1 text-xs font-medium ${roleColors[member.role]}`}>
                          {member.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={member.is_active ? "text-emerald-300" : "text-zinc-500"}>
                          {member.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-stone-400">{formatDate(member.created_at)}</td>
                      <td className="px-6 py-4 text-right">
                        {member.is_active && (
                          <button
                            onClick={() => handleDeactivate(member)}
                            disabled={saving}
                            className="text-sm text-red-300 transition-colors hover:text-red-200 disabled:text-zinc-600"
                          >
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </div>
      </main>
    </div>
  );
}
