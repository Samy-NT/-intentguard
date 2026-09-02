"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, PlugZap, RefreshCw, Terminal, Webhook } from "lucide-react";
import { Sidebar } from "@/app/components/Sidebar";
import { apiKeyHeaders, getStoredApiKey, storeApiKey } from "@/app/dashboard/api-key";

interface IntegrationSettings {
  webhook_url?: string;
  webhook_secret?: string;
  webhook_secret_configured?: boolean;
  webhook_threshold?: number;
  siem_url?: string;
  siem_secret?: string;
  siem_secret_configured?: boolean;
}

interface WebhookJob {
  id: string;
  intent_id: string | null;
  event: string;
  status: "pending" | "delivered" | "failed" | "blocked";
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  http_status: number | null;
  delivered_at: string | null;
  created_at: string;
}

interface WebhookDelivery {
  id: string;
  intent_id: string;
  event: string;
  status: "blocked" | "delivered" | "failed";
  http_status: number | null;
  error: string | null;
  created_at: string;
}

interface OpsStatus {
  status: "ok" | "warn" | "fail";
  generated_at: string;
  checks: Array<{ name: string; status: "ok" | "warn" | "fail"; detail: string }>;
  webhooks: {
    configured: boolean;
    pending: number;
    due: number;
    failed: number;
    blocked: number;
    delivered: number;
    oldest_pending_age_seconds: number | null;
    latest_delivery_at: string | null;
    latest_delivery_status: "blocked" | "delivered" | "failed" | null;
  };
  siem: {
    configured: boolean;
    nightly_export_enabled: boolean;
  };
  verification: {
    last_24h: number;
    flagged_pending: number;
    blocked_last_24h: number;
  };
  sla: {
    window_hours: number;
    target_success_rate: number;
    webhook_attempts: number;
    webhook_failures: number;
    webhook_success_rate: number | null;
    error_budget_burn_percent: number | null;
    max_pending_age_seconds: number | null;
    backlog_due: number;
  };
  alerts: {
    severity: "none" | "warning" | "critical";
    routing_configured: boolean;
    channels: string[];
    reasons: string[];
    recommended_actions: string[];
  };
}

const SDK_SNIPPET = `import { createIntentGuardClient } from "intentguard/sdk";

const intentguard = createIntentGuardClient({
  apiKey: process.env.INTENTGUARD_API_KEY!,
  baseUrl: "https://your-deployment.vercel.app",
});

const decision = await intentguard.verify({
  intent_id: "pay_2026_0001",
  agent_id: "ag_finance_ops",
  amount: 4800,
  currency: "USD",
  recipient: "billing@stripe.com",
  merchant_id: "stripe",
  agent_context: "Renewing annual Stripe subscription.",
  metadata: { category: "saas" },
});`;

const LANGCHAIN_SNIPPET = `import { createIntentGuardClient } from "intentguard/sdk";
import { createLangChainTool } from "intentguard/sdk/adapters";

const guard = createIntentGuardClient({
  apiKey: process.env.INTENTGUARD_API_KEY!,
});

export const actionGuardTool = createLangChainTool(guard);`;

const CREWAI_SNIPPET = `import { createIntentGuardClient } from "intentguard/sdk";
import { createCrewAITool } from "intentguard/sdk/adapters";

const guard = createIntentGuardClient({
  apiKey: process.env.INTENTGUARD_API_KEY!,
});

export const actionGuard = createCrewAITool(guard);`;

function statusClass(status: string) {
  if (status === "delivered") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  if (status === "pending") return "border-blue-500/25 bg-blue-500/10 text-blue-300";
  if (status === "blocked") return "border-amber-500/25 bg-amber-500/10 text-amber-300";
  return "border-red-500/25 bg-red-500/10 text-red-300";
}

function opsStatusClass(status: "ok" | "warn" | "fail") {
  if (status === "ok") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  if (status === "warn") return "border-amber-500/25 bg-amber-500/10 text-amber-300";
  return "border-red-500/25 bg-red-500/10 text-red-300";
}

function formatAge(seconds: number | null) {
  if (seconds === null) return "-";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

function formatPercent(value: number | null) {
  if (value === null) return "-";
  return `${Math.round(value * 1000) / 10}%`;
}

function SnippetCard({ title, description, code }: { title: string; description: string; code: string }) {
  return (
    <div className="border border-stone-800 bg-zinc-900/60">
      <div className="border-b border-stone-800 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="mt-1 text-xs text-zinc-500">{description}</p>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-zinc-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function IntegrationsPage() {
  const [apiKey, setApiKey] = useState("");
  const [settings, setSettings] = useState<IntegrationSettings>({});
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookThreshold, setWebhookThreshold] = useState(70);
  const [siemUrl, setSiemUrl] = useState("");
  const [siemSecret, setSiemSecret] = useState("");
  const [jobs, setJobs] = useState<WebhookJob[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [opsStatus, setOpsStatus] = useState<OpsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setApiKey(getStoredApiKey());
  }, []);

  async function load() {
    if (!apiKey.trim()) {
      setLoading(false);
      setError("Enter an API key to load integrations");
      return;
    }

    setLoading(true);
    const [settingsRes, jobsRes, deliveriesRes, opsRes] = await Promise.all([
      fetch("/api/v1/workspace/settings", { headers: apiKeyHeaders(apiKey) }),
      fetch("/api/v1/workspace/webhook-jobs", { headers: apiKeyHeaders(apiKey) }),
      fetch("/api/v1/workspace/webhook-deliveries", { headers: apiKeyHeaders(apiKey) }),
      fetch("/api/v1/workspace/ops-status", { headers: apiKeyHeaders(apiKey) }),
    ]);

    const settingsData = await settingsRes.json().catch(() => ({}));
    const jobsData = await jobsRes.json().catch(() => ({}));
    const deliveriesData = await deliveriesRes.json().catch(() => ({}));
    const opsData = await opsRes.json().catch(() => ({}));
    setLoading(false);

    if (!settingsRes.ok) {
      setError(settingsData.error ?? `HTTP ${settingsRes.status}`);
      return;
    }

    const nextSettings = settingsData.settings ?? {};
    setSettings(nextSettings);
    setWebhookUrl(nextSettings.webhook_url ?? "");
    setWebhookSecret(nextSettings.webhook_secret_configured ? "********" : "");
    setWebhookThreshold(typeof nextSettings.webhook_threshold === "number" ? nextSettings.webhook_threshold : 70);
    setSiemUrl(nextSettings.siem_url ?? "");
    setSiemSecret(nextSettings.siem_secret_configured ? "********" : "");
    setJobs(jobsRes.ok ? jobsData.jobs ?? [] : []);
    setDeliveries(deliveriesRes.ok ? deliveriesData.deliveries ?? [] : []);
    setOpsStatus(opsRes.ok || opsRes.status === 503 ? opsData : null);
    setError(null);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/v1/workspace/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...apiKeyHeaders(apiKey) },
      body: JSON.stringify({
        ...settings,
        webhook_url: webhookUrl || null,
        webhook_secret: webhookSecret || null,
        webhook_threshold: webhookThreshold,
        siem_url: siemUrl || null,
        siem_secret: siemSecret || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? `HTTP ${res.status}`);
      return;
    }
    setToast("Integrations saved");
    setTimeout(() => setToast(null), 2500);
    await load();
  }

  async function retryJob(id: string) {
    const res = await fetch("/api/v1/workspace/webhook-jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...apiKeyHeaders(apiKey) },
      body: JSON.stringify({ id }),
    });
    if (res.ok) await load();
  }

  const jobStats = useMemo(
    () => ({
      pending: jobs.filter((job) => job.status === "pending").length,
      failed: jobs.filter((job) => job.status === "failed").length,
      delivered: jobs.filter((job) => job.status === "delivered").length,
    }),
    [jobs]
  );

  return (
    <div className="flex min-h-screen aurel-bg text-white">
      <Sidebar />
      <main className="ml-64 flex-1 p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2  border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
                <PlugZap className="h-3.5 w-3.5" />
                Agent and ops integrations
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">Integrations</h1>
              <p className="mt-2 text-sm text-stone-400">
                Connect Aurels to agent frameworks, webhooks, SIEM exports, and operational alerting.
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
              className="w-full  border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500/50 md:w-72"
            />
          </div>

          {error && <div className="border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
          {toast && (
            <div className="fixed bottom-6 right-6 z-50 border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-300">
              {toast}
            </div>
          )}

          {opsStatus && (
            <section className="border border-stone-800 bg-zinc-900/60 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-stone-500">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Ops status
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`border px-2.5 py-1 text-xs font-semibold uppercase ${opsStatusClass(opsStatus.status)}`}>
                      {opsStatus.status}
                    </span>
                    <span className="text-sm text-stone-500">
                      Updated {new Date(opsStatus.generated_at).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="border border-stone-800 bg-black/35 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-600">Due</div>
                    <div className="mt-1 text-2xl font-semibold text-blue-300">{opsStatus.webhooks.due}</div>
                  </div>
                  <div className="border border-stone-800 bg-black/35 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-600">Terminal</div>
                    <div className="mt-1 text-2xl font-semibold text-red-300">
                      {opsStatus.webhooks.failed + opsStatus.webhooks.blocked}
                    </div>
                  </div>
                  <div className="border border-stone-800 bg-black/35 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-600">Review</div>
                    <div className="mt-1 text-2xl font-semibold text-amber-300">{opsStatus.verification.flagged_pending}</div>
                  </div>
                  <div className="border border-stone-800 bg-black/35 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-600">Oldest</div>
                    <div className="mt-1 text-2xl font-semibold text-stone-200">
                      {formatAge(opsStatus.webhooks.oldest_pending_age_seconds)}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {opsStatus.checks.map((check) => (
                  <div key={check.name} className="flex items-start justify-between gap-4 border border-stone-800 bg-black/35 p-3">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-stone-600">{check.name}</div>
                      <div className="mt-1 text-sm text-stone-300">{check.detail}</div>
                    </div>
                    <span className={`shrink-0 border px-2 py-1 text-[10px] font-semibold uppercase ${opsStatusClass(check.status)}`}>
                      {check.status}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-5 border border-stone-800 bg-black/35 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-stone-600">SLA alerting</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`border px-2 py-1 text-[10px] font-semibold uppercase ${opsStatusClass(opsStatus.status)}`}>
                        {opsStatus.alerts.severity}
                      </span>
                      <span className="text-sm text-stone-400">
                        {opsStatus.alerts.routing_configured
                          ? `Routes: ${opsStatus.alerts.channels.join(", ")}`
                          : "No alert route configured"}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-right sm:grid-cols-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-600">SLO</div>
                      <div className="mt-1 text-sm font-semibold text-stone-200">
                        {formatPercent(opsStatus.sla.target_success_rate)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-600">Success</div>
                      <div className="mt-1 text-sm font-semibold text-stone-200">
                        {formatPercent(opsStatus.sla.webhook_success_rate)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-600">Burn</div>
                      <div className="mt-1 text-sm font-semibold text-stone-200">
                        {opsStatus.sla.error_budget_burn_percent === null
                          ? "-"
                          : `${opsStatus.sla.error_budget_burn_percent}%`}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-600">Window</div>
                      <div className="mt-1 text-sm font-semibold text-stone-200">{opsStatus.sla.window_hours}h</div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {opsStatus.alerts.recommended_actions.map((action) => (
                    <div key={action} className="border border-stone-800 bg-zinc-950/60 px-3 py-2 text-xs text-stone-300">
                      {action}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="border border-stone-800 bg-zinc-900/60 p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-500">Pending jobs</div>
              <div className="mt-2 text-3xl font-semibold text-blue-300">{jobStats.pending}</div>
            </div>
            <div className="border border-stone-800 bg-zinc-900/60 p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-500">Delivered</div>
              <div className="mt-2 text-3xl font-semibold text-emerald-400">{jobStats.delivered}</div>
            </div>
            <div className="border border-stone-800 bg-zinc-900/60 p-4">
              <div className="text-xs uppercase tracking-wider text-zinc-500">Failed</div>
              <div className="mt-2 text-3xl font-semibold text-red-400">{jobStats.failed}</div>
            </div>
          </div>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="border border-stone-800 bg-zinc-900/60 p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Webhook className="h-4 w-4 text-blue-300" />
                Webhook escalation
              </h2>
              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs uppercase tracking-wider text-zinc-600">Webhook URL</span>
                  <input
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://ops.example.com/aurel"
                    className="mt-2 w-full  border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500/50"
                  />
                </label>
                <label className="block">
                  <span className="text-xs uppercase tracking-wider text-zinc-600">Webhook secret</span>
                  <input
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder="shared HMAC secret"
                    className="mt-2 w-full  border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500/50"
                  />
                </label>
                <label className="block">
                  <span className="text-xs uppercase tracking-wider text-zinc-600">Risk threshold</span>
                  <input
                    type="number"
                    min={0}
                    max={101}
                    value={webhookThreshold}
                    onChange={(e) => setWebhookThreshold(Number(e.target.value))}
                    className="mt-2 w-full  border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500/50"
                  />
                </label>
              </div>
            </div>

            <div className="border border-stone-800 bg-zinc-900/60 p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Terminal className="h-4 w-4 text-emerald-300" />
                SIEM export
              </h2>
              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs uppercase tracking-wider text-zinc-600">SIEM URL</span>
                  <input
                    value={siemUrl}
                    onChange={(e) => setSiemUrl(e.target.value)}
                    placeholder="https://siem.example.com/audit"
                    className="mt-2 w-full  border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/50"
                  />
                </label>
                <label className="block">
                  <span className="text-xs uppercase tracking-wider text-zinc-600">SIEM secret</span>
                  <input
                    value={siemSecret}
                    onChange={(e) => setSiemSecret(e.target.value)}
                    placeholder="shared HMAC secret"
                    className="mt-2 w-full  border border-stone-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/50"
                  />
                </label>
                <button
                  type="button"
                  disabled={saving || loading}
                  onClick={save}
                  className="inline-flex items-center gap-2  bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {saving ? "Saving..." : "Save integrations"}
                </button>
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <SnippetCard title="TypeScript SDK" description="Protect custom agents and backend jobs." code={SDK_SNIPPET} />
            <SnippetCard title="LangChain" description="Wrap Aurels as an action intent guard." code={LANGCHAIN_SNIPPET} />
            <SnippetCard title="CrewAI" description="Add Aurels before high-consequence agent tasks." code={CREWAI_SNIPPET} />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="border border-stone-800 bg-zinc-900/60">
              <div className="flex items-center justify-between border-b border-stone-800 px-5 py-4">
                <h2 className="text-sm font-semibold">Webhook jobs</h2>
                <button
                  type="button"
                  onClick={load}
                  className="inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-200"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </button>
              </div>
              <div className="divide-y divide-zinc-800/70">
                {jobs.slice(0, 8).map((job) => (
                  <div key={job.id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-zinc-300">{job.event}</div>
                      <div className="mt-1 text-xs text-zinc-600">
                        {job.intent_id ?? "workspace event"} · {job.attempts}/{job.max_attempts}
                      </div>
                      {job.last_error && <div className="mt-1 truncate text-xs text-red-300">{job.last_error}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={` border px-2 py-1 text-xs ${statusClass(job.status)}`}>{job.status}</span>
                      {job.status === "failed" && (
                        <button
                          type="button"
                          onClick={() => retryJob(job.id)}
                          className=" border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-blue-500/50 hover:text-blue-300"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {!jobs.length && <div className="p-8 text-center text-sm text-zinc-500">No webhook jobs yet.</div>}
              </div>
            </div>

            <div className="border border-stone-800 bg-zinc-900/60">
              <div className="border-b border-stone-800 px-5 py-4">
                <h2 className="text-sm font-semibold">Recent deliveries</h2>
              </div>
              <div className="divide-y divide-zinc-800/70">
                {deliveries.slice(0, 8).map((delivery) => (
                  <div key={delivery.id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-zinc-300">{delivery.event}</div>
                      <div className="mt-1 text-xs text-zinc-600">
                        {delivery.intent_id} · {new Date(delivery.created_at).toLocaleString()}
                      </div>
                      {delivery.error && <div className="mt-1 truncate text-xs text-red-300">{delivery.error}</div>}
                    </div>
                    <span className={` border px-2 py-1 text-xs ${statusClass(delivery.status)}`}>
                      {delivery.http_status ?? "-"} {delivery.status}
                    </span>
                  </div>
                ))}
                {!deliveries.length && <div className="p-8 text-center text-sm text-zinc-500">No deliveries yet.</div>}
              </div>
            </div>
          </section>

          <div className="border border-stone-800 bg-zinc-900/60 p-5">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="h-4 w-4 text-stone-300" />
              Recommended next setup
            </h2>
            <p className="text-sm text-stone-400">
              Configure webhook escalation first, then connect SIEM exports for nightly audit summaries. Use an operator API key for retry workflows and an admin key only for changing secrets.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
