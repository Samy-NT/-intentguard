"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, GitPullRequestArrow, XCircle } from "lucide-react";
import { Sidebar } from "@/app/components/Sidebar";
import { apiKeyHeaders, getStoredApiKey, storeApiKey } from "@/app/dashboard/api-key";

interface ReviewLog {
  id: string;
  intent_id: string;
  agent_id: string;
  recipient: string;
  merchant_id: string | null;
  amount: number;
  currency: string;
  decision: "allow" | "block" | "flag";
  risk_score: number;
  review_status: "not_required" | "pending" | "approved" | "rejected";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

type ReviewFilter = "pending" | "approved" | "rejected" | "all";

export default function ReviewsPage() {
  const [apiKey, setApiKey] = useState("");
  const [logs, setLogs] = useState<ReviewLog[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setApiKey(getStoredApiKey());
  }, []);

  async function load() {
    if (!apiKey.trim()) {
      setLoading(false);
      setError("Enter an API key to load reviews");
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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  async function review(id: string, review_status: "approved" | "rejected") {
    setBusyId(id);
    const res = await fetch("/api/v1/logs/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...apiKeyHeaders(apiKey) },
      body: JSON.stringify({
        id,
        review_status,
        review_note: review_status === "approved" ? "Approved from review queue" : "Rejected from review queue",
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(data.error ?? `HTTP ${res.status}`);
      return;
    }
    setLogs((prev) =>
      prev.map((log) =>
        log.id === id
          ? {
              ...log,
              review_status: data.log.review_status,
              review_note: data.log.review_note,
              reviewed_at: data.log.reviewed_at,
            }
          : log
      )
    );
  }

  const reviewable = logs.filter((log) => log.decision === "flag" || log.review_status !== "not_required");
  const visible = useMemo(() => {
    if (filter === "all") return reviewable;
    return reviewable.filter((log) => log.review_status === filter);
  }, [filter, reviewable]);

  const counts = {
    pending: reviewable.filter((log) => log.review_status === "pending").length,
    approved: reviewable.filter((log) => log.review_status === "approved").length,
    rejected: reviewable.filter((log) => log.review_status === "rejected").length,
    all: reviewable.length,
  };

  return (
    <div className="flex min-h-screen flex-col aurel-bg text-white lg:flex-row">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-8 lg:ml-64">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2  border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
                <GitPullRequestArrow className="h-3.5 w-3.5" />
                Human review queue
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">Reviews</h1>
              <p className="mt-2 text-sm text-stone-400">
                Triage flagged decisions, approve legitimate payments, and reject suspicious agent behavior.
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
              className="w-full  border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500/50 md:w-72"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(["pending", "approved", "rejected", "all"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={` border px-3 py-2 text-sm transition-colors ${
                  filter === item
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                    : "border-stone-800 bg-zinc-900/60 text-stone-400 hover:border-stone-600 hover:text-zinc-200"
                }`}
              >
                {item} <span className="ml-1 text-xs text-zinc-500">{counts[item]}</span>
              </button>
            ))}
          </div>

          {error && <div className="border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}

          <div className="overflow-hidden border border-stone-800 bg-zinc-900/60">
            {loading ? (
              <div className="p-10 text-center text-sm text-zinc-500">Loading review queue...</div>
            ) : visible.length === 0 ? (
              <div className="p-12 text-center text-sm text-zinc-500">No reviews in this queue.</div>
            ) : (
              <div className="divide-y divide-zinc-800/70">
                {visible.map((log) => (
                  <div key={log.id} className="grid gap-4 p-5 transition-colors hover:bg-stone-950/25 lg:grid-cols-[1fr_auto]">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className=" border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
                          {log.review_status}
                        </span>
                        <span className="font-mono text-xs text-zinc-500">{log.intent_id}</span>
                        <span className="text-xs text-zinc-600">{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                      <div className="grid gap-3 md:grid-cols-4">
                        <div>
                          <div className="text-xs uppercase tracking-wider text-zinc-600">Agent</div>
                          <div className="mt-1 truncate text-sm text-zinc-300">{log.agent_id}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wider text-zinc-600">Recipient</div>
                          <div className="mt-1 truncate text-sm text-zinc-300">{log.recipient}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wider text-zinc-600">Amount</div>
                          <div className="mt-1 font-mono text-sm text-zinc-200">
                            {Number(log.amount).toLocaleString()} {log.currency}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wider text-zinc-600">Risk</div>
                          <div className="mt-1 text-sm font-semibold text-amber-300">{log.risk_score}/100</div>
                        </div>
                      </div>
                      {log.review_note && <p className="text-sm text-zinc-500">{log.review_note}</p>}
                    </div>
                    <div className="flex items-center gap-2 lg:justify-end">
                      <Link
                        href={`/dashboard/audit/${log.id}`}
                        className=" border border-zinc-700 px-3 py-2 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
                      >
                        Detail
                      </Link>
                      {log.review_status === "pending" && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === log.id}
                            onClick={() => review(log.id, "approved")}
                            className="inline-flex items-center gap-1  border border-emerald-500/30 px-3 py-2 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busyId === log.id}
                            onClick={() => review(log.id, "rejected")}
                            className="inline-flex items-center gap-1  border border-red-500/30 px-3 py-2 text-xs text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
