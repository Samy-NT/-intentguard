"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { apiKeyHeaders, getStoredApiKey, storeApiKey } from "../api-key";
import { Sidebar } from "@/app/components/Sidebar";
import {
  Key,
  Settings,
  Users,
  Tag,
  Bot,
  Zap,
  Bell,
  ClipboardList,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Category =
  | "saas"
  | "travel"
  | "hardware"
  | "marketing"
  | "legal"
  | "finance"
  | "crypto"
  | "other";
type Sensitivity = "low" | "medium" | "high";
type SemanticFailMode = "allow" | "flag" | "block";

interface Vendor {
  name: string;
  max_amount: number;
}

interface AgentRule {
  agent_id: string;
  max_amount: number;
  max_daily: number;
  allowed_recipients: string;
  active: boolean;
}

interface ApiKeyRecord {
  id: string;
  name: string;
  role: "admin" | "operator" | "viewer";
  is_active: boolean;
  created_at: string;
}

interface PolicySettings {
  block_crypto: boolean;
  max_amount_usd: number;
  max_amount_daily_usd: number;
  semantic_sensitivity: Sensitivity;
  semantic_fail_mode: SemanticFailMode;
  block_weekends: boolean;
  allowed_hours: { start: number; end: number; timezone: string };
  allowed_recipients: string[];
  blocked_recipients: string[];
  known_vendors: Vendor[];
  strict_recipients: boolean;
  allowed_categories: Category[];
  strict_categories: boolean;
  per_agent_rules: AgentRule[];
  velocity_max_per_hour: number;
  velocity_max_per_day: number;
  velocity_max_amount_per_hour: number;
  dedup_window_seconds: number;
  webhook_url: string;
  webhook_secret: string;
  webhook_threshold: number;
  siem_url: string;
  siem_secret: string;
  escalate_on_block: boolean;
  escalate_on_flag: boolean;
  escalate_on_risk_score: boolean;
  escalate_above_amount: number;
  log_retention_days: number;
  log_full_context: boolean;
  nightly_export: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT: PolicySettings = {
  block_crypto: false,
  max_amount_usd: 10000,
  max_amount_daily_usd: 50000,
  semantic_sensitivity: "medium",
  semantic_fail_mode: "flag",
  block_weekends: false,
  allowed_hours: { start: 0, end: 23, timezone: "UTC" },
  allowed_recipients: [],
  blocked_recipients: [],
  known_vendors: [],
  strict_recipients: false,
  allowed_categories: ["saas", "travel", "hardware", "marketing", "legal", "finance"],
  strict_categories: false,
  per_agent_rules: [],
  velocity_max_per_hour: 10,
  velocity_max_per_day: 50,
  velocity_max_amount_per_hour: 10000,
  dedup_window_seconds: 60,
  webhook_url: "",
  webhook_secret: "",
  webhook_threshold: 70,
  siem_url: "",
  siem_secret: "",
  escalate_on_block: true,
  escalate_on_flag: true,
  escalate_on_risk_score: true,
  escalate_above_amount: 0,
  log_retention_days: 90,
  log_full_context: false,
  nightly_export: false,
};

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "saas", label: "SaaS" },
  { id: "travel", label: "Travel" },
  { id: "hardware", label: "Hardware" },
  { id: "marketing", label: "Marketing" },
  { id: "legal", label: "Legal" },
  { id: "finance", label: "Finance" },
  { id: "crypto", label: "Crypto" },
  { id: "other", label: "Other" },
];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney",
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ── Primitive components ──────────────────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="aurel-panel overflow-hidden">
      <div className="px-6 py-4 border-b border-stone-800 bg-zinc-900/80">
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-stone-400" />
          <div>
            <h2 className="font-semibold text-white text-sm">{title}</h2>
            {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
          </div>
        </div>
      </div>
      <div className="divide-y divide-zinc-800/60">{children}</div>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-8 px-6 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        {description && <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function FullRow({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="px-6 py-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center  transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 ${
        checked ? "bg-stone-100" : "bg-zinc-700"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform  bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function NumInput({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  prefix,
  suffix,
  width = "w-28",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  width?: string;
}) {
  return (
    <div className="inline-flex items-center bg-zinc-800 border border-zinc-700  overflow-hidden">
      {prefix && (
        <span className="px-2.5 text-zinc-500 text-xs border-r border-zinc-700 select-none">
          {prefix}
        </span>
      )}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`bg-transparent px-3 py-2 text-sm text-white focus:outline-none ${width}`}
      />
      {suffix && (
        <span className="px-2.5 text-zinc-500 text-xs border-l border-zinc-700 select-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-zinc-800 border border-zinc-700  px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-stone-400/20 focus:border-stone-300/60 transition-colors ${className}`}
    />
  );
}

function SelectInput<T extends string>({
  value,
  onChange,
  options,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={`bg-zinc-800 border border-zinc-700  px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stone-400/20 focus:border-stone-300/60 transition-colors ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function TagsInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function add() {
    const val = input.trim();
    if (val && !tags.includes(val)) onChange([...tags, val]);
    setInput("");
  }

  return (
    <div className="space-y-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs px-2.5 py-1 "
            >
              {t}
              <button
                type="button"
                onClick={() => onChange(tags.filter((x) => x !== t))}
                className="text-zinc-500 hover:text-red-400 transition-colors ml-0.5 leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          placeholder={placeholder ?? "Add and press Enter…"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="flex-1 bg-zinc-800 border border-zinc-700  px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-stone-400/20 focus:border-stone-300/60 transition-colors"
        />
        <button
          type="button"
          onClick={add}
          className="bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs px-3 py-2  transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [s, setS] = useState<PolicySettings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [showSecret, setShowSecret] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [newApiKeyName, setNewApiKeyName] = useState("Production key");
  const [newApiKeyRole, setNewApiKeyRole] = useState<ApiKeyRecord["role"]>("operator");
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const set = useCallback(
    <K extends keyof PolicySettings>(key: K, value: PolicySettings[K]) =>
      setS((prev) => ({ ...prev, [key]: value })),
    []
  );

  useEffect(() => {
    const storedApiKey = getStoredApiKey();
    setApiKey(storedApiKey);
    if (!storedApiKey) {
      setLoading(false);
      showToast("error", "Enter an API key to load workspace settings");
      return;
    }

    fetch("/api/workspace/settings", { headers: apiKeyHeaders(storedApiKey) })
      .then((r) => r.json())
      .then(({ settings }) => {
        if (settings) setS((prev) => ({ ...prev, ...settings }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    fetchApiKeys(storedApiKey);
    // Initial load should use the key captured from session storage once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(type: "success" | "error", message: string) {
    clearTimeout(toastRef.current);
    setToast({ type, message });
    toastRef.current = setTimeout(() => setToast(null), 4000);
  }

  async function fetchApiKeys(key = apiKey) {
    if (!key.trim()) return;
    try {
      const res = await fetch("/api/workspace/api-keys", { headers: apiKeyHeaders(key) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load API keys");
      setApiKeys(data.api_keys ?? []);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed to load API keys");
    }
  }

  async function createApiKey() {
    try {
      const res = await fetch("/api/workspace/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeaders(apiKey) },
        body: JSON.stringify({ name: newApiKeyName, role: newApiKeyRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create API key");
      setCreatedApiKey(data.raw_key);
      await fetchApiKeys();
      showToast("success", "API key created. Copy it now; it will not be shown again.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed to create API key");
    }
  }

  async function revokeApiKey(id: string) {
    if (!confirm("Revoke this API key? Existing integrations using it will stop working.")) return;
    try {
      const res = await fetch("/api/workspace/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...apiKeyHeaders(apiKey) },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to revoke API key");
      await fetchApiKeys();
      showToast("success", "API key revoked");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed to revoke API key");
    }
  }

  function validate(): boolean {
    const errs: string[] = [];
    if (s.max_amount_usd <= 0) errs.push("Max amount per transaction must be > 0");
    if (s.max_amount_daily_usd <= 0) errs.push("Max daily amount must be > 0");
    if (s.allowed_hours.start >= s.allowed_hours.end)
      errs.push("Allowed hours: start must be before end");
    if (s.webhook_url && !/^https?:\/\/.+/.test(s.webhook_url))
      errs.push("Webhook URL must be a valid HTTP/HTTPS URL");
    if (s.siem_url && !/^https?:\/\/.+/.test(s.siem_url))
      errs.push("SIEM URL must be a valid HTTP/HTTPS URL");
    if (s.velocity_max_per_hour <= 0) errs.push("Velocity max per hour must be > 0");
    if (s.velocity_max_per_day <= 0) errs.push("Velocity max per day must be > 0");
    if (s.dedup_window_seconds < 0) errs.push("Dedup window must be ≥ 0");
    if (s.per_agent_rules.some((r) => !r.agent_id.trim()))
      errs.push("Agent rules: all agent IDs must be filled in");
    if (s.known_vendors.some((v) => !v.name.trim()))
      errs.push("Vendors: all vendor names must be filled in");
    setErrors(errs);
    return errs.length === 0;
  }

  async function save() {
    if (!validate()) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/workspace/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...apiKeyHeaders(apiKey) },
        body: JSON.stringify(s),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      showToast("success", "Settings saved successfully");
      setErrors([]);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    if (!confirm("Reset all settings to defaults? This cannot be undone.")) return;
    setS(DEFAULT);
    setErrors([]);
  }

  function addVendor() {
    set("known_vendors", [...s.known_vendors, { name: "", max_amount: 500 }]);
  }
  function updateVendor(i: number, patch: Partial<Vendor>) {
    set(
      "known_vendors",
      s.known_vendors.map((v, idx) => (idx === i ? { ...v, ...patch } : v))
    );
  }
  function removeVendor(i: number) {
    set("known_vendors", s.known_vendors.filter((_, idx) => idx !== i));
  }

  function addAgentRule() {
    set("per_agent_rules", [
      ...s.per_agent_rules,
      { agent_id: "", max_amount: 5000, max_daily: 20000, allowed_recipients: "", active: true },
    ]);
  }
  function updateRule(i: number, patch: Partial<AgentRule>) {
    set(
      "per_agent_rules",
      s.per_agent_rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    );
  }
  function removeRule(i: number) {
    set("per_agent_rules", s.per_agent_rules.filter((_, idx) => idx !== i));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-500 text-sm">
          <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-400  animate-spin" />
          Loading settings…
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen aurel-bg">
      <Sidebar />
      
      <main className="flex-1 ml-64">
        {/* ── Header ─────────────────────────────────────── */}
        <header className="border-b border-stone-800/60 bg-black/80 backdrop-blur-sm sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 group">
                <div className="w-7 h-7  bg-stone-100 text-black flex items-center justify-center text-xs font-bold">
                  IG
                </div>
                <span className="font-bold text-lg tracking-tight group-hover:text-zinc-300 transition-colors">
                  Aurel
                </span>
              </Link>
              <div className="w-px h-5 bg-zinc-700" />
              <nav className="flex items-center gap-1">
                <Link
                  href="/dashboard"
                  className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5  hover:bg-stone-950"
                >
                  Logs
                </Link>
                <Link
                  href="/dashboard/settings"
                  className="text-sm text-white bg-zinc-800 px-3 py-1.5 "
                >
                  Settings
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  storeApiKey(e.target.value);
                }}
                onBlur={() => fetchApiKeys()}
                placeholder="API key"
                className="w-44 bg-zinc-900 border border-stone-800 text-zinc-300 placeholder-zinc-600 text-xs px-3 py-1.5  focus:outline-none focus:ring-2 focus:ring-stone-400/20"
              />
              <button
                type="button"
                onClick={resetDefaults}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5  hover:bg-stone-950"
              >
                Reset to defaults
              </button>
              <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 bg-stone-100 hover:bg-white disabled:bg-zinc-900 disabled:cursor-not-allowed text-black disabled:text-zinc-600 text-sm font-medium px-4 py-2  transition-colors"
            >
              {saving && (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white  animate-spin" />
              )}
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">
        {/* ── Toast ──────────────────────────────────────── */}
        {toast && (
          <div
            className={`flex items-center gap-3 px-5 py-4  border text-sm font-medium transition-all ${
              toast.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-red-500/10 border-red-500/30 text-red-400"
            }`}
          >
            <span>{toast.type === "success" ? "✓" : "✕"}</span>
            {toast.message}
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-auto opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        )}

        {/* ── Validation errors ──────────────────────────── */}
        {errors.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30  px-5 py-4 space-y-1">
            <p className="text-sm font-semibold text-red-400 mb-2">
              Please fix the following errors:
            </p>
            {errors.map((e, i) => (
              <p key={i} className="text-xs text-red-400/80 flex items-start gap-2">
                <span className="mt-0.5">•</span> {e}
              </p>
            ))}
          </div>
        )}

        <SectionCard
          icon={Key}
          title="API Keys"
          description="Workspace-scoped keys for production integrations"
        >
          <FullRow label="Create key" description="The raw key is displayed once after creation">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={newApiKeyName}
                onChange={(e) => setNewApiKeyName(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700  px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-stone-400/20"
              />
              <SelectInput
                value={newApiKeyRole}
                onChange={(v) => setNewApiKeyRole(v)}
                options={[
                  { value: "operator", label: "Operator" },
                  { value: "viewer", label: "Viewer" },
                  { value: "admin", label: "Admin" },
                ]}
                className="w-32"
              />
              <button
                type="button"
                onClick={createApiKey}
                className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-200 text-sm px-4 py-2  transition-colors"
              >
                Create
              </button>
            </div>
            {createdApiKey && (
              <div className="mt-3  border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-xs text-amber-300 mb-2">
                  Copy this key now. It will not be shown again.
                </p>
                <code className="block text-xs text-zinc-100 break-all">{createdApiKey}</code>
              </div>
            )}
          </FullRow>

          <FullRow label="Existing keys">
            <div className="space-y-2">
              {apiKeys.length === 0 && (
                <p className="text-sm text-zinc-500">No keys loaded for this workspace.</p>
              )}
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between gap-3  border border-stone-800 bg-zinc-950/50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{key.name}</p>
                    <p className="text-xs text-zinc-600">
                      {key.role} · {key.is_active ? "Active" : "Revoked"} ·{" "}
                      {new Date(key.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {key.is_active && (
                    <button
                      type="button"
                      onClick={() => revokeApiKey(key.id)}
                      className="text-xs text-red-400 hover:text-red-300 border border-red-500/30  px-3 py-1.5"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </FullRow>
        </SectionCard>

        {/* ── Section 1 — General Policies ─────────────── */}
        <SectionCard
          icon={Settings}
          title="General Policies"
          description="Global transaction limits and baseline security settings"
        >
          <SettingRow
            label="Block crypto transactions"
            description="Automatically block any transaction involving crypto recipients or currencies"
          >
            <Toggle checked={s.block_crypto} onChange={(v) => set("block_crypto", v)} />
          </SettingRow>

          <SettingRow
            label="Max amount per transaction"
            description="Hard cap on a single transaction (USD equivalent)"
          >
            <NumInput
              value={s.max_amount_usd}
              onChange={(v) => set("max_amount_usd", v)}
              min={1}
              prefix="$"
              suffix="USD"
            />
          </SettingRow>

          <SettingRow
            label="Max daily amount"
            description="Cumulative spend cap across all agents per day"
          >
            <NumInput
              value={s.max_amount_daily_usd}
              onChange={(v) => set("max_amount_daily_usd", v)}
              min={1}
              prefix="$"
              suffix="USD"
            />
          </SettingRow>

          <SettingRow
            label="Block weekend transactions"
            description="Reject all transactions on Saturdays and Sundays"
          >
            <Toggle checked={s.block_weekends} onChange={(v) => set("block_weekends", v)} />
          </SettingRow>

          <FullRow
            label="Semantic sensitivity"
            description="Controls how aggressively Claude flags anomalies in agent reasoning"
          >
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={2}
                step={1}
                value={s.semantic_sensitivity === "low" ? 0 : s.semantic_sensitivity === "medium" ? 1 : 2}
                onChange={(e) => {
                  const map: Sensitivity[] = ["low", "medium", "high"];
                  set("semantic_sensitivity", map[Number(e.target.value)]);
                }}
                className="flex-1 accent-stone-200 h-2 cursor-pointer"
              />
              <div className="flex gap-1">
                {(["low", "medium", "high"] as Sensitivity[]).map((v) => (
                  <span
                    key={v}
                    className={`text-xs px-2.5 py-1  font-medium capitalize ${
                      s.semantic_sensitivity === v
                        ? "bg-stone-100 text-black"
                        : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          </FullRow>

          <SettingRow
            label="Semantic failure mode"
            description="Decision returned when Claude analysis is unavailable"
          >
            <SelectInput
              value={s.semantic_fail_mode}
              onChange={(v) => set("semantic_fail_mode", v)}
              options={[
                { value: "flag", label: "Flag for review" },
                { value: "block", label: "Block" },
                { value: "allow", label: "Allow" },
              ]}
              className="w-40"
            />
          </SettingRow>

          <FullRow
            label="Allowed transaction hours"
            description="Transactions outside this window will be blocked"
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">From</span>
                <SelectInput
                  value={String(s.allowed_hours.start) as unknown as string}
                  onChange={(v) =>
                    set("allowed_hours", { ...s.allowed_hours, start: Number(v) })
                  }
                  options={HOURS.map((h) => ({
                    value: String(h) as unknown as string,
                    label: `${String(h).padStart(2, "0")}:00`,
                  }))}
                  className="w-24"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">to</span>
                <SelectInput
                  value={String(s.allowed_hours.end) as unknown as string}
                  onChange={(v) =>
                    set("allowed_hours", { ...s.allowed_hours, end: Number(v) })
                  }
                  options={HOURS.map((h) => ({
                    value: String(h) as unknown as string,
                    label: `${String(h).padStart(2, "0")}:00`,
                  }))}
                  className="w-24"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Timezone</span>
                <SelectInput
                  value={s.allowed_hours.timezone as unknown as string}
                  onChange={(v) =>
                    set("allowed_hours", { ...s.allowed_hours, timezone: v as string })
                  }
                  options={TIMEZONES.map((tz) => ({ value: tz as unknown as string, label: tz }))}
                  className="w-44"
                />
              </div>
            </div>
          </FullRow>
        </SectionCard>

        {/* ── Section 2 — Recipients & Vendors ─────────── */}
        <SectionCard
          icon={Users}
          title="Recipients & Vendors"
          description="Control who your agents can send money to"
        >
          <SettingRow
            label="Strict mode"
            description="Block any recipient not explicitly in the allowed list"
          >
            <Toggle
              checked={s.strict_recipients}
              onChange={(v) => set("strict_recipients", v)}
            />
          </SettingRow>

          <FullRow
            label="Allowed recipients"
            description="Whitelist — only these recipients will be approved (when strict mode is on)"
          >
            <TagsInput
              tags={s.allowed_recipients}
              onChange={(v) => set("allowed_recipients", v)}
              placeholder="vendor@acme.com or wallet address…"
            />
          </FullRow>

          <FullRow
            label="Blocked recipients"
            description="Blacklist — these recipients are always blocked regardless of other rules"
          >
            <TagsInput
              tags={s.blocked_recipients}
              onChange={(v) => set("blocked_recipients", v)}
              placeholder="bad-actor@example.com…"
            />
          </FullRow>

          <FullRow
            label="Known vendors with per-vendor limits"
            description="Named vendors with individual max amount caps"
          >
            <div className="space-y-2">
              {s.known_vendors.length > 0 && (
                <div className="border border-stone-800  overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-800 bg-zinc-900/60">
                        <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">
                          Vendor name
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium">
                          Max amount (USD)
                        </th>
                        <th className="w-10 px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {s.known_vendors.map((v, i) => (
                        <tr key={i} className="group">
                          <td className="px-4 py-2">
                            <TextInput
                              value={v.name}
                              onChange={(val) => updateVendor(i, { name: val })}
                              placeholder="Acme Corp"
                              className="w-full"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <NumInput
                              value={v.max_amount}
                              onChange={(val) => updateVendor(i, { max_amount: val })}
                              min={1}
                              prefix="$"
                              width="w-24"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeVendor(i)}
                              className="text-zinc-600 hover:text-red-400 transition-colors text-lg leading-none"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button
                type="button"
                onClick={addVendor}
                className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors border border-dashed border-zinc-700 hover:border-zinc-600  px-4 py-2.5 w-full justify-center"
              >
                + Add vendor
              </button>
            </div>
          </FullRow>
        </SectionCard>

        {/* ── Section 3 — Spending Categories ──────────── */}
        <SectionCard
          icon={Tag}
          title="Spending Categories"
          description="Control which spending categories are allowed"
        >
          <SettingRow
            label="Strict category mode"
            description="Block transactions with no category or an unlisted category"
          >
            <Toggle
              checked={s.strict_categories}
              onChange={(v) => set("strict_categories", v)}
            />
          </SettingRow>

          <FullRow
            label="Allowed categories"
            description="Check all categories your agents are permitted to spend in"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CATEGORIES.map((c) => {
                const checked = s.allowed_categories.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-2.5 px-3.5 py-2.5  border cursor-pointer transition-colors text-sm select-none ${
                      checked
                        ? "bg-stone-100 border-stone-500 text-black"
                        : "bg-zinc-800/60 border-zinc-700 text-stone-400 hover:border-zinc-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        set(
                          "allowed_categories",
                          e.target.checked
                            ? [...s.allowed_categories, c.id]
                            : s.allowed_categories.filter((x) => x !== c.id)
                        )
                      }
                      className="accent-stone-200 w-3.5 h-3.5"
                    />
                    {c.label}
                  </label>
                );
              })}
            </div>
          </FullRow>
        </SectionCard>

        {/* ── Section 4 — Per-agent Rules ───────────────── */}
        <SectionCard
          icon={Bot}
          title="Per-agent Rules"
          description="Override global rules for specific agent IDs"
        >
          <FullRow
            label="Agent-specific overrides"
            description="Rules defined here take precedence over global policies for the matching agent_id"
          >
            <div className="space-y-2">
              {s.per_agent_rules.length > 0 && (
                <div className="border border-stone-800  overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-800 bg-zinc-900/60">
                        <th className="text-left px-3 py-2.5 text-xs text-zinc-500 font-medium">
                          Agent ID
                        </th>
                        <th className="text-left px-3 py-2.5 text-xs text-zinc-500 font-medium">
                          Max / tx
                        </th>
                        <th className="text-left px-3 py-2.5 text-xs text-zinc-500 font-medium">
                          Max / day
                        </th>
                        <th className="text-left px-3 py-2.5 text-xs text-zinc-500 font-medium hidden lg:table-cell">
                          Allowed recipients
                        </th>
                        <th className="text-center px-3 py-2.5 text-xs text-zinc-500 font-medium">
                          Active
                        </th>
                        <th className="w-8 px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {s.per_agent_rules.map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2">
                            <TextInput
                              value={r.agent_id}
                              onChange={(v) => updateRule(i, { agent_id: v })}
                              placeholder="agent_gpt4"
                              className="w-32"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <NumInput
                              value={r.max_amount}
                              onChange={(v) => updateRule(i, { max_amount: v })}
                              min={1}
                              prefix="$"
                              width="w-20"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <NumInput
                              value={r.max_daily}
                              onChange={(v) => updateRule(i, { max_daily: v })}
                              min={1}
                              prefix="$"
                              width="w-20"
                            />
                          </td>
                          <td className="px-3 py-2 hidden lg:table-cell">
                            <TextInput
                              value={r.allowed_recipients}
                              onChange={(v) => updateRule(i, { allowed_recipients: v })}
                              placeholder="vendor@a.com, vendor@b.com"
                              className="w-48"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Toggle
                              checked={r.active}
                              onChange={(v) => updateRule(i, { active: v })}
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeRule(i)}
                              className="text-zinc-600 hover:text-red-400 transition-colors text-lg leading-none"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button
                type="button"
                onClick={addAgentRule}
                className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors border border-dashed border-zinc-700 hover:border-zinc-600  px-4 py-2.5 w-full justify-center"
              >
                + Add agent rule
              </button>
            </div>
          </FullRow>
        </SectionCard>

        {/* ── Section 5 — Velocity & Frequency ─────────── */}
        <SectionCard
          icon={Zap}
          title="Velocity & Frequency"
          description="Rate limits applied per agent to detect unusual activity"
        >
          <SettingRow
            label="Max transactions per hour per agent"
            description="Triggers a block when exceeded within a rolling 60-minute window"
          >
            <NumInput
              value={s.velocity_max_per_hour}
              onChange={(v) => set("velocity_max_per_hour", v)}
              min={1}
              suffix="tx/hr"
            />
          </SettingRow>

          <SettingRow
            label="Max transactions per day per agent"
            description="Cumulative count cap over a 24-hour rolling window"
          >
            <NumInput
              value={s.velocity_max_per_day}
              onChange={(v) => set("velocity_max_per_day", v)}
              min={1}
              suffix="tx/day"
            />
          </SettingRow>

          <SettingRow
            label="Max cumulative amount per hour"
            description="Sum of all amounts within a rolling 60-minute window per agent"
          >
            <NumInput
              value={s.velocity_max_amount_per_hour}
              onChange={(v) => set("velocity_max_amount_per_hour", v)}
              min={1}
              prefix="$"
              suffix="USD"
            />
          </SettingRow>

          <SettingRow
            label="Duplicate detection window"
            description="Transactions with the same amount + recipient within this window are flagged as duplicates"
          >
            <NumInput
              value={s.dedup_window_seconds}
              onChange={(v) => set("dedup_window_seconds", v)}
              min={0}
              suffix="seconds"
              width="w-24"
            />
          </SettingRow>
        </SectionCard>

        {/* ── Section 6 — Escalation & Webhook ─────────── */}
        <SectionCard
          icon={Bell}
          title="Escalation & Webhook"
          description="Human-in-the-loop notifications for risky transactions"
        >
          <FullRow label="Webhook URL" description="HTTPS endpoint that receives escalation payloads">
            <TextInput
              value={s.webhook_url}
              onChange={(v) => set("webhook_url", v)}
              placeholder="https://hooks.example.com/Aurel"
              type="url"
              className="w-full"
            />
          </FullRow>

          <FullRow
            label="Webhook secret"
            description="Used to sign payloads with HMAC-SHA256 (X-IntentGuard-Signature header)"
          >
            <div className="flex gap-2">
              <input
                type={showSecret ? "text" : "password"}
                value={s.webhook_secret}
                onChange={(e) => set("webhook_secret", e.target.value)}
                placeholder="whsec_…"
                className="flex-1 bg-zinc-800 border border-zinc-700  px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-stone-400/20 focus:border-stone-300/60 font-mono transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-stone-400 text-xs px-3 py-2  transition-colors"
              >
                {showSecret ? "Hide" : "Show"}
              </button>
            </div>
          </FullRow>

          <FullRow label="SIEM export URL" description="Optional HTTPS endpoint for nightly audit summaries">
            <TextInput
              value={s.siem_url}
              onChange={(v) => set("siem_url", v)}
              placeholder="https://siem.example.com/ingest/Aurel"
              type="url"
              className="w-full"
            />
          </FullRow>

          <FullRow
            label="SIEM secret"
            description="Used to sign SIEM export payloads with HMAC-SHA256"
          >
            <div className="flex gap-2">
              <input
                type={showSecret ? "text" : "password"}
                value={s.siem_secret}
                onChange={(e) => set("siem_secret", e.target.value)}
                placeholder="siemsec_..."
                className="flex-1 bg-zinc-800 border border-zinc-700  px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-stone-400/20 focus:border-stone-300/60 font-mono transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-stone-400 text-xs px-3 py-2  transition-colors"
              >
                {showSecret ? "Hide" : "Show"}
              </button>
            </div>
          </FullRow>

          <FullRow
            label={`Risk score threshold — ${s.webhook_threshold}`}
            description="Transactions with risk_score ≥ this value trigger an escalation"
          >
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={s.webhook_threshold}
                onChange={(e) => set("webhook_threshold", Number(e.target.value))}
                className="flex-1 accent-stone-200 h-2 cursor-pointer"
              />
              <span
                className={`text-sm font-bold tabular-nums w-10 text-right ${
                  s.webhook_threshold >= 80
                    ? "text-emerald-400"
                    : s.webhook_threshold >= 50
                    ? "text-amber-400"
                    : "text-red-400"
                }`}
              >
                {s.webhook_threshold}
              </span>
            </div>
            <div className="flex justify-between text-xs text-zinc-600 mt-1">
              <span>0 — escalate everything</span>
              <span>100 — never escalate</span>
            </div>
          </FullRow>

          <FullRow label="Escalate when…" description="Choose which conditions trigger a notification">
            <div className="space-y-2">
              {(
                [
                  {
                    key: "escalate_on_block" as const,
                    label: "Decision is block",
                    desc: "Notify whenever a transaction is automatically blocked",
                  },
                  {
                    key: "escalate_on_flag" as const,
                    label: "Decision is flag",
                    desc: "Notify when a transaction is flagged for manual review",
                  },
                  {
                    key: "escalate_on_risk_score" as const,
                    label: "Risk score ≥ threshold",
                    desc: "Notify when the composite risk score exceeds the slider above",
                  },
                ] as const
              ).map((item) => (
                <label
                  key={item.key}
                  className="flex items-start gap-3 px-4 py-3 bg-zinc-800/40 border border-stone-800  cursor-pointer hover:bg-stone-950/60 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={s[item.key]}
                    onChange={(e) => set(item.key, e.target.checked)}
                    className="mt-0.5 accent-stone-200 w-4 h-4 flex-shrink-0"
                  />
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{item.label}</p>
                    <p className="text-xs text-zinc-500">{item.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </FullRow>

          <SettingRow
            label="Mandatory escalation above amount"
            description="Any transaction above this amount always triggers an escalation (0 = disabled)"
          >
            <NumInput
              value={s.escalate_above_amount}
              onChange={(v) => set("escalate_above_amount", v)}
              min={0}
              prefix="$"
              suffix="USD"
            />
          </SettingRow>
        </SectionCard>

        {/* ── Section 7 — Audit & Compliance ───────────── */}
        <SectionCard
          icon={ClipboardList}
          title="Audit & Compliance"
          description="Log retention and data export settings"
        >
          <SettingRow
            label="Log retention period"
            description="How long verification logs are kept before automatic deletion"
          >
            <SelectInput
              value={String(s.log_retention_days) as unknown as string}
              onChange={(v) => set("log_retention_days", Number(v))}
              options={[
                { value: "30" as unknown as string, label: "30 days" },
                { value: "90" as unknown as string, label: "90 days" },
                { value: "365" as unknown as string, label: "365 days" },
              ]}
              className="w-32"
            />
          </SettingRow>

          <SettingRow
            label="Include full agent context in logs"
            description="Store the complete agent_context string — increases storage, improves auditability"
          >
            <Toggle
              checked={s.log_full_context}
              onChange={(v) => set("log_full_context", v)}
            />
          </SettingRow>

          <SettingRow
            label="Nightly export to webhook"
            description="Automatically POST a daily summary of all verifications to your webhook URL at midnight UTC"
          >
            <Toggle
              checked={s.nightly_export}
              onChange={(v) => set("nightly_export", v)}
            />
          </SettingRow>
        </SectionCard>

        {/* ── Footer actions ────────────────────────────── */}
        <div className="flex items-center justify-between py-4">
          <button
            type="button"
            onClick={resetDefaults}
            className="text-sm text-zinc-600 hover:text-stone-400 transition-colors"
          >
            Reset to defaults
          </button>
          <div className="flex gap-3">
            <Link
              href="/dashboard"
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors px-5 py-2.5  border border-stone-800 hover:border-stone-600"
            >
              Cancel
            </Link>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 bg-stone-100 hover:bg-white disabled:bg-zinc-900 disabled:cursor-not-allowed text-black disabled:text-zinc-600 text-sm font-semibold px-6 py-2.5  transition-colors"
            >
              {saving && (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white  animate-spin" />
              )}
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      </div>
      </main>
    </div>
  );
}
