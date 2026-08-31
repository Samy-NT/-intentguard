"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Search, FileCheck2 } from "lucide-react";
import { Sidebar } from "@/app/components/Sidebar";
import { apiKeyHeaders, getStoredApiKey, storeApiKey } from "@/app/dashboard/api-key";

interface AuditLog {
  id: string;
  intent_id: string;
  agent_id: string;
  recipient: string;
  merchant_id: string | null;
  amount: number;
  currency: string;
  decision: "allow" | "block" | "flag";
  risk_score: number;
  audit_signature: string | null;
  audit_signature_version: string | null;
  created_at: string;
}

function decisionClass(decision: AuditLog["decision"]) {
  if (decision === "allow") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/25";
  if (decision === "flag") return "text-amber-400 bg-amber-500/10 border-amber-500/25";
  return "text-red-400 bg-red-500/10 border-red-500/25";
}

export default function AuditTrailPage() {
  const [apiKey, setApiKey] = useState("");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredApiKey();
    setApiKey(stored);
  }, []);

  useEffect(() => {
    async function load() {
      if (!apiKey.trim()) {
        setLoading(false);
        setError("Enter an API key to load audit logs");
        return;
      }
      setLoading(true);
      const res = await fetch("/api/logs", { headers: apiKeyHeaders(apiKey) });
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setError(null);
      setLogs(data.logs ?? []);
    }
    load();
  }, [apiKey]);

  const filtered = logs.filter((log) => {
    const haystack = `${log.intent_id} ${log.agent_id} ${log.recipient} ${log.merchant_id ?? ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  const signed = logs.filter((log) => log.audit_signature).length;

  return (
    <div className="flex min-h-screen aurel-bg text-white">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2  border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                Signed audit trail
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">Audit Trail</h1>
              <p className="mt-2 text-sm text-stone-400">
                Verify decision integrity, inspect signed logs, and export evidence for finance or security review.
              </p>
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                storeApiKey(e.target.value);
              }}
              placeholder="API key"
              className="w-full  border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/50 md:w-72"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="border border-stone-800 bg-zinc-900/60 p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-500">Total logs</div>
              <div className="mt-2 text-3xl font-semibold">{logs.length}</div>
            </div>
            <div className="border border-stone-800 bg-zinc-900/60 p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-500">Signed</div>
              <div className="mt-2 text-3xl font-semibold text-emerald-400">{signed}</div>
            </div>
            <div className="border border-stone-800 bg-zinc-900/60 p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-500">Unsigned legacy</div>
              <div className="mt-2 text-3xl font-semibold text-amber-400">{logs.length - signed}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 border border-stone-800 bg-zinc-900/60 px-4 py-3">
            <Search className="h-4 w-4 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search intent, agent, recipient"
              className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
            />
          </div>

          {error && <div className="border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}

          <div className="overflow-hidden border border-stone-800 bg-zinc-900/60">
            {loading ? (
              <div className="p-10 text-center text-sm text-zinc-500">Loading audit logs...</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-12 text-center text-zinc-500">
                <FileCheck2 className="h-7 w-7" />
                <p className="text-sm">No audit logs match this view.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-stone-800 text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Intent</th>
                    <th className="px-4 py-3 text-left font-medium">Agent</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-4 py-3 text-center font-medium">Decision</th>
                    <th className="px-4 py-3 text-center font-medium">Signature</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {filtered.map((log) => (
                    <tr key={log.id} className="hover:bg-stone-950/30">
                      <td className="px-4 py-4">
                        <div className="font-mono text-xs text-zinc-200">{log.intent_id}</div>
                        <div className="mt-1 text-xs text-zinc-600">{new Date(log.created_at).toLocaleString()}</div>
                      </td>
                      <td className="px-4 py-4 text-stone-400">{log.agent_id}</td>
                      <td className="px-4 py-4 text-right font-mono">
                        {Number(log.amount).toLocaleString()} {log.currency}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex  border px-2.5 py-1 text-xs font-semibold ${decisionClass(log.decision)}`}>
                          {log.decision}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {log.audit_signature ? (
                          <span className="text-xs text-emerald-400">{log.audit_signature_version}</span>
                        ) : (
                          <span className="text-xs text-amber-400">legacy unsigned</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link
                          href={`/dashboard/audit/${log.id}`}
                          className=" border border-zinc-700 px-3 py-2 text-xs text-zinc-300 transition-colors hover:border-emerald-500/50 hover:text-emerald-300"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
