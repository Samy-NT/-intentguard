"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { Sidebar } from "@/app/components/Sidebar";
import { apiKeyHeaders, getStoredApiKey, storeApiKey } from "@/app/dashboard/api-key";

interface AuditLogDetail {
  id: string;
  intent_id: string;
  agent_id: string;
  recipient: string;
  merchant_id: string | null;
  amount: number;
  currency: string;
  agent_context: string | null;
  decision: "allow" | "block" | "flag";
  risk_score: number;
  triggered_rule: string | null;
  review_status: "not_required" | "pending" | "approved" | "rejected";
  review_note: string | null;
  reviewed_at: string | null;
  audit_signature: string | null;
  audit_signature_version: string | null;
  created_at: string;
}

interface VerificationState {
  valid: boolean;
  reason?: string;
}

export default function AuditDetailPage() {
  const params = useParams<{ id: string }>();
  const [apiKey, setApiKey] = useState("");
  const [log, setLog] = useState<AuditLogDetail | null>(null);
  const [verification, setVerification] = useState<VerificationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = getStoredApiKey();
    setApiKey(stored);
  }, []);

  useEffect(() => {
    async function load() {
      if (!apiKey.trim()) {
        setLoading(false);
        setError("Enter an API key to load this audit record");
        return;
      }

      setLoading(true);
      const [logRes, verifyRes] = await Promise.all([
        fetch(`/api/logs?id=${encodeURIComponent(params.id)}`, { headers: apiKeyHeaders(apiKey) }),
        fetch(`/api/v1/workspace/audit-verify?id=${encodeURIComponent(params.id)}`, { headers: apiKeyHeaders(apiKey) }),
      ]);
      const logData = await logRes.json().catch(() => ({}));
      const verifyData = await verifyRes.json().catch(() => ({}));
      setLoading(false);

      if (!logRes.ok) {
        setError(logData.error ?? `HTTP ${logRes.status}`);
        return;
      }

      setError(null);
      setLog(logData.log);
      setVerification(verifyRes.ok ? verifyData : { valid: false, reason: verifyData.error ?? "Verification failed" });
    }
    load();
  }, [apiKey, params.id]);

  return (
    <div className="flex min-h-screen flex-col aurel-bg text-white lg:flex-row">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-8 lg:ml-64">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <Link href="/dashboard/audit" className="text-sm text-zinc-500 hover:text-zinc-300">
                Back to audit trail
              </Link>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">Audit Detail</h1>
              <p className="mt-2 text-sm text-stone-400">Inspect the decision record, review state, and signature proof.</p>
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

          {error && <div className="border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}

          {loading ? (
            <div className="border border-stone-800 bg-zinc-900/60 p-10 text-center text-sm text-zinc-500">Loading audit record...</div>
          ) : log ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="border border-stone-800 bg-zinc-900/60 p-4">
                  <div className="text-xs uppercase tracking-wider text-zinc-500">Decision</div>
                  <div className="mt-2 text-2xl font-semibold">{log.decision}</div>
                </div>
                <div className="border border-stone-800 bg-zinc-900/60 p-4">
                  <div className="text-xs uppercase tracking-wider text-zinc-500">Risk score</div>
                  <div className="mt-2 text-2xl font-semibold">{log.risk_score}/100</div>
                </div>
                <div className="border border-stone-800 bg-zinc-900/60 p-4">
                  <div className="text-xs uppercase tracking-wider text-zinc-500">Signature</div>
                  <div className={`mt-2 flex items-center gap-2 text-sm ${verification?.valid ? "text-emerald-400" : "text-amber-400"}`}>
                    {verification?.valid ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {verification?.valid ? "Verified" : verification?.reason ?? "Not verified"}
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <section className="border border-stone-800 bg-zinc-900/60 p-5">
                  <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    Signed decision record
                  </h2>
                  <dl className="grid gap-3 text-sm">
                    {[
                      ["Intent", log.intent_id],
                      ["Agent", log.agent_id],
                      ["Recipient", log.recipient],
                      ["Merchant", log.merchant_id ?? "none"],
                      ["Amount", `${Number(log.amount).toLocaleString()} ${log.currency}`],
                      ["Triggered rule", log.triggered_rule ?? "none"],
                      ["Evaluated", new Date(log.created_at).toLocaleString()],
                    ].map(([label, value]) => (
                      <div key={label} className="grid gap-1 border-b border-stone-800/70 pb-3 last:border-0">
                        <dt className="text-xs uppercase tracking-wider text-zinc-600">{label}</dt>
                        <dd className="break-all font-mono text-zinc-200">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <section className="space-y-6">
                  <div className="border border-stone-800 bg-zinc-900/60 p-5">
                    <h2 className="mb-3 text-sm font-semibold">Signature</h2>
                    <div className="space-y-3 text-sm">
                      <div>
                        <div className="text-xs uppercase tracking-wider text-zinc-600">Version</div>
                        <div className="mt-1 font-mono text-zinc-300">{log.audit_signature_version ?? "none"}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wider text-zinc-600">Digest</div>
                        <div className="mt-1 break-all font-mono text-xs text-zinc-300">{log.audit_signature ?? "unsigned legacy log"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="border border-stone-800 bg-zinc-900/60 p-5">
                    <h2 className="mb-3 text-sm font-semibold">Review state</h2>
                    <div className="text-sm text-zinc-300">{log.review_status}</div>
                    {log.review_note && <p className="mt-3 text-sm text-zinc-500">{log.review_note}</p>}
                    {log.reviewed_at && <p className="mt-2 text-xs text-zinc-600">{new Date(log.reviewed_at).toLocaleString()}</p>}
                  </div>
                </section>
              </div>

              <section className="border border-stone-800 bg-zinc-900/60 p-5">
                <h2 className="mb-3 text-sm font-semibold">Agent context</h2>
                <pre className="whitespace-pre-wrap  border border-stone-800 bg-zinc-950 p-4 text-sm text-zinc-300">
                  {log.agent_context ?? "No agent context stored for this verification."}
                </pre>
              </section>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
