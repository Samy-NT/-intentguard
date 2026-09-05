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

interface ActionAuditLog {
  id: string;
  action_id: string;
  integration: string;
  agent_id: string | null;
  decision: "allow" | "block" | "require_approval" | "rewrite" | "quarantine";
  reason: string | null;
  risk_score: number;
  audit_signature: string;
  audit_signature_version: string;
  created_at: string;
}

interface ActionTelemetryEvent {
  id: string;
  action_id: string;
  integration: string;
  outcome_status: string;
  duration_ms: number | null;
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
  const [actionLogs, setActionLogs] = useState<ActionAuditLog[]>([]);
  const [telemetryEvents, setTelemetryEvents] = useState<ActionTelemetryEvent[]>([]);
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
      const [res, actionRes] = await Promise.all([
        fetch("/api/logs", { headers: apiKeyHeaders(apiKey) }),
        fetch("/api/workspace/action-audit", { headers: apiKeyHeaders(apiKey) }),
      ]);
      const telemetryRes = await fetch("/api/workspace/action-telemetry", { headers: apiKeyHeaders(apiKey) });
      const data = await res.json().catch(() => ({}));
      const actionData = await actionRes.json().catch(() => ({}));
      const telemetryData = await telemetryRes.json().catch(() => ({}));
      setLoading(false);
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setError(null);
      setLogs(data.logs ?? []);
      setActionLogs(actionRes.ok ? actionData.logs ?? [] : []);
      setTelemetryEvents(telemetryRes.ok ? telemetryData.events ?? [] : []);
    }
    load();
  }, [apiKey]);

  const filtered = logs.filter((log) => {
    const haystack = `${log.intent_id} ${log.agent_id} ${log.recipient} ${log.merchant_id ?? ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  const signed = logs.filter((log) => log.audit_signature).length;

  return (
    <div className="flex min-h-screen flex-col aurel-bg text-white lg:flex-row">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-8 lg:ml-64">
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

          <div className="border border-stone-800 bg-zinc-900/60 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Post-execution telemetry</h2>
                <p className="mt-1 text-xs text-zinc-500">Redacted outcomes reported by protected integrations.</p>
              </div>
              <span className="font-mono text-xs text-emerald-400">{telemetryEvents.length} events</span>
            </div>
            {telemetryEvents.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {(["success", "failure", "blocked"] as const).map((status) => (
                  <div key={status} className="border border-stone-800 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-600">{status}</div>
                    <div className="mt-1 font-mono text-lg text-zinc-200">{telemetryEvents.filter((event) => event.outcome_status === status).length}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <section className="overflow-hidden border border-stone-800 bg-zinc-900/60">
            <div className="flex items-center justify-between border-b border-stone-800 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Generic action decisions</h2>
                <p className="mt-1 text-xs text-zinc-500">Signed preflight records for tool calls and agent actions.</p>
              </div>
              <span className="font-mono text-xs text-emerald-400">{actionLogs.length} signed</span>
            </div>
            {actionLogs.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-500">No generic action audits yet.</div>
            ) : (
              <div className="divide-y divide-zinc-800/70">
                {actionLogs.map((log) => (
                  <div key={log.id} className="flex flex-col gap-2 px-4 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-mono text-xs text-zinc-200">{log.action_id}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {log.integration} · {log.agent_id ?? "unknown agent"} · {new Date(log.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-zinc-400">risk {log.risk_score}</span>
                      <span className={`border px-2 py-1 text-xs ${log.decision === "allow" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400" : log.decision === "block" ? "border-red-500/25 bg-red-500/10 text-red-400" : "border-amber-500/25 bg-amber-500/10 text-amber-400"}`}>
                        {log.decision}
                      </span>
                      <span className="text-xs text-emerald-400">signed</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
