"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  intent_id: string;
  agent_id: string;
  recipient: string;
  amount: number;
  currency: string;
  decision: "allow" | "block" | "flag";
  risk_score: number;
  triggered_rule: string | null;
  created_at: string;
}

interface WorkspaceSettings {
  max_amount_usd: number;
  max_amount_daily_usd: number;
  velocity_max_per_hour: number;
  velocity_max_per_day: number;
  velocity_max_amount_per_hour: number;
  block_crypto: boolean;
  blocked_recipients: string[];
  webhook_threshold: number;
}

type SortOption = "date_desc" | "risk_desc" | "amount_desc";
type PeriodFilter = "1h" | "24h" | "7d" | "30d" | "all";

// ── Rule configs for the sidebar panel ────────────────────────────────────────

interface RuleConfig {
  key: keyof WorkspaceSettings;
  label: string;
  description: string;
  type: "number" | "boolean" | "tags";
  prefix?: string;
  suffix?: string;
}

const RULE_CONFIGS: RuleConfig[] = [
  {
    key: "max_amount_usd",
    label: "Max per transaction",
    description: "Hard cap on single transaction",
    type: "number",
    prefix: "$",
    suffix: "USD",
  },
  {
    key: "max_amount_daily_usd",
    label: "Max daily volume",
    description: "Cumulative spend cap per day",
    type: "number",
    prefix: "$",
    suffix: "USD",
  },
  {
    key: "velocity_max_per_hour",
    label: "Max tx per hour",
    description: "Per-agent transaction rate limit",
    type: "number",
    suffix: "tx/hr",
  },
  {
    key: "velocity_max_amount_per_hour",
    label: "Max volume per hour",
    description: "Per-agent hourly spend cap",
    type: "number",
    prefix: "$",
    suffix: "USD",
  },
  {
    key: "block_crypto",
    label: "Block crypto",
    description: "Auto-block crypto transactions",
    type: "boolean",
  },
  {
    key: "blocked_recipients",
    label: "Blocked recipients",
    description: "Always-blocked addresses",
    type: "tags",
  },
];

const DEFAULT_SETTINGS: WorkspaceSettings = {
  max_amount_usd: 10000,
  max_amount_daily_usd: 50000,
  velocity_max_per_hour: 10,
  velocity_max_per_day: 50,
  velocity_max_amount_per_hour: 10000,
  block_crypto: false,
  blocked_recipients: [],
  webhook_threshold: 70,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ruleValueDisplay(cfg: RuleConfig, settings: WorkspaceSettings): string {
  const val = settings[cfg.key];
  if (cfg.type === "boolean") return (val as boolean) ? "On" : "Off";
  if (cfg.type === "tags") {
    const arr = val as string[];
    return arr.length === 0 ? "None" : `${arr.length} entries`;
  }
  const num = val as number;
  return `${cfg.prefix ?? ""}${num.toLocaleString()}${cfg.suffix ? ` ${cfg.suffix}` : ""}`;
}

function periodCutoff(period: PeriodFilter): Date | null {
  if (period === "all") return null;
  const ms = { "1h": 3600_000, "24h": 86400_000, "7d": 604800_000, "30d": 2592000_000 }[period];
  return new Date(Date.now() - ms);
}

// ── Decision styles ───────────────────────────────────────────────────────────

const DECISION_STYLES = {
  allow: { badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400", label: "allow" },
  block: { badge: "bg-red-500/15 text-red-400 border-red-500/30", dot: "bg-red-400", label: "block" },
  flag:  { badge: "bg-amber-500/15 text-amber-400 border-amber-500/30", dot: "bg-amber-400", label: "flag" },
};

// ── Small components ──────────────────────────────────────────────────────────

function RiskBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-red-500" : score >= 40 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-zinc-400 tabular-nums w-6">{score}</span>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: LogEntry["decision"] }) {
  const s = DECISION_STYLES[decision];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function FilterBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-violet-500/10 border border-violet-500/25 text-violet-300 text-xs px-2.5 py-1 rounded-full font-medium">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 text-violet-400 hover:text-white transition-colors leading-none"
        aria-label="Remove filter"
      >
        ×
      </button>
    </span>
  );
}

// ── Edit Rule Modal ───────────────────────────────────────────────────────────

function EditRuleModal({
  cfg,
  settings,
  onSave,
  onClose,
}: {
  cfg: RuleConfig;
  settings: WorkspaceSettings;
  onSave: (key: keyof WorkspaceSettings, value: WorkspaceSettings[keyof WorkspaceSettings]) => Promise<void>;
  onClose: () => void;
}) {
  const current = settings[cfg.key];
  const [numVal, setNumVal] = useState<number>(cfg.type === "number" ? (current as number) : 0);
  const [boolVal, setBoolVal] = useState<boolean>(cfg.type === "boolean" ? (current as boolean) : false);
  const [tagsInput, setTagsInput] = useState<string>(cfg.type === "tags" ? (current as string[]).join("\n") : "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    let value: WorkspaceSettings[keyof WorkspaceSettings];
    if (cfg.type === "number") value = numVal;
    else if (cfg.type === "boolean") value = boolVal;
    else value = tagsInput.split("\n").map((s) => s.trim()).filter(Boolean);
    await onSave(cfg.key, value);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-white text-sm">{cfg.label}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{cfg.description}</p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors text-xl leading-none flex-shrink-0">
            ×
          </button>
        </div>

        <div>
          {cfg.type === "number" && (
            <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden">
              {cfg.prefix && (
                <span className="px-3 text-zinc-500 text-sm border-r border-zinc-700 select-none">{cfg.prefix}</span>
              )}
              <input
                type="number"
                value={numVal}
                min={1}
                onChange={(e) => setNumVal(Number(e.target.value))}
                className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white focus:outline-none"
                autoFocus
              />
              {cfg.suffix && (
                <span className="px-3 text-zinc-500 text-xs border-l border-zinc-700 select-none">{cfg.suffix}</span>
              )}
            </div>
          )}
          {cfg.type === "boolean" && (
            <button
              type="button"
              role="switch"
              aria-checked={boolVal}
              onClick={() => setBoolVal(!boolVal)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${boolVal ? "bg-violet-600" : "bg-zinc-700"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${boolVal ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          )}
          {cfg.type === "tags" && (
            <div>
              <p className="text-xs text-zinc-600 mb-1.5">One entry per line</p>
              <textarea
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                rows={4}
                placeholder="bad-actor@example.com&#10;offshore-wallet.ru"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/60 font-mono resize-none transition-colors"
                autoFocus
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 transition-colors px-4 py-2.5 rounded-xl"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            {saving && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Triggered Rule Modal ──────────────────────────────────────────────────────

function TriggeredRuleModal({
  log,
  settings,
  onAdjustRule,
  onClose,
}: {
  log: LogEntry;
  settings: WorkspaceSettings | null;
  onAdjustRule: (cfg: RuleConfig) => void;
  onClose: () => void;
}) {
  // Heuristic: match the triggered_rule string to relevant configs
  const ruleStr = (log.triggered_rule ?? "").toLowerCase();
  const relevantRules: RuleConfig[] = settings
    ? RULE_CONFIGS.filter((cfg) => {
        if (cfg.type === "boolean" || cfg.type === "tags") return false;
        if ((ruleStr.includes("amount") || ruleStr.includes("cap") || ruleStr.includes("threshold")) &&
            cfg.key === "max_amount_usd") return true;
        if ((ruleStr.includes("velocity") || ruleStr.includes("count")) &&
            cfg.key === "velocity_max_per_hour") return true;
        if ((ruleStr.includes("velocity") || ruleStr.includes("volume")) &&
            cfg.key === "velocity_max_amount_per_hour") return true;
        return false;
      })
    : [];

  const decisionStyle = DECISION_STYLES[log.decision];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-white text-sm">Triggered Rule</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Decision context for this transaction</p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors text-xl leading-none flex-shrink-0">×</button>
        </div>

        {/* Rule ID */}
        {log.triggered_rule && (
          <div className="bg-zinc-800/60 border border-zinc-700 rounded-xl p-4 space-y-2">
            <div className="text-[10px] text-zinc-600 uppercase tracking-widest font-mono mb-2">Rule identifier</div>
            <code className="text-xs font-mono text-amber-400 break-all">{log.triggered_rule}</code>
          </div>
        )}

        {/* Transaction context */}
        <div className="space-y-2">
          <div className="text-[10px] text-zinc-600 uppercase tracking-widest font-mono">Transaction</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              ["Decision", <span key="d" className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${decisionStyle.badge}`}><span className={`w-1.5 h-1.5 rounded-full ${decisionStyle.dot}`} />{log.decision}</span>],
              ["Risk score", <span key="r" className={log.risk_score >= 70 ? "text-red-400 font-semibold" : log.risk_score >= 40 ? "text-amber-400 font-semibold" : "text-emerald-400"}>{log.risk_score}/100</span>],
              ["Amount", <span key="a" className="font-mono text-white">{log.currency} {log.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>],
              ["Recipient", <span key="rec" className="text-zinc-400 text-xs truncate">{log.recipient}</span>],
            ].map(([k, v]) => (
              <div key={String(k)} className="bg-zinc-800/40 border border-zinc-800 rounded-lg p-2.5">
                <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1 font-mono">{k}</div>
                <div>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Relevant thresholds */}
        {settings && (
          <div className="space-y-2">
            <div className="text-[10px] text-zinc-600 uppercase tracking-widest font-mono">Workspace limits</div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs bg-zinc-800/40 border border-zinc-800 rounded-lg px-3 py-2">
                <span className="text-zinc-500">Max per tx</span>
                <span className="font-mono text-zinc-300">${settings.max_amount_usd.toLocaleString()} USD</span>
              </div>
              <div className="flex items-center justify-between text-xs bg-zinc-800/40 border border-zinc-800 rounded-lg px-3 py-2">
                <span className="text-zinc-500">Max tx / hour</span>
                <span className="font-mono text-zinc-300">{settings.velocity_max_per_hour} tx/hr</span>
              </div>
              <div className="flex items-center justify-between text-xs bg-zinc-800/40 border border-zinc-800 rounded-lg px-3 py-2">
                <span className="text-zinc-500">Max vol / hour</span>
                <span className="font-mono text-zinc-300">${settings.velocity_max_amount_per_hour.toLocaleString()} USD</span>
              </div>
            </div>
          </div>
        )}

        {/* Adjust buttons */}
        {relevantRules.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] text-zinc-600 uppercase tracking-widest font-mono">Adjust rule</div>
            <div className="flex flex-wrap gap-2">
              {relevantRules.map((cfg) => (
                <button
                  key={String(cfg.key)}
                  type="button"
                  onClick={() => { onAdjustRule(cfg); onClose(); }}
                  className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-white transition-colors px-3 py-2 rounded-lg"
                >
                  <span className="text-violet-400">✏</span>
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 transition-colors px-4 py-2.5 rounded-xl"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Active Rules Panel ────────────────────────────────────────────────────────

function ActiveRulesPanel({
  settings,
  loading,
  onEdit,
}: {
  settings: WorkspaceSettings | null;
  loading: boolean;
  onEdit: (cfg: RuleConfig) => void;
}) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden sticky top-[73px]">
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-sm text-white">Active Rules</h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">Live workspace policy</p>
        </div>
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-zinc-600 text-xs gap-2">
          <span className="w-3.5 h-3.5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
          Loading rules…
        </div>
      ) : !settings ? (
        <div className="py-8 px-5 text-center text-zinc-600 text-xs">
          Could not load rules
        </div>
      ) : (
        <div className="divide-y divide-zinc-800/60">
          {RULE_CONFIGS.map((cfg) => (
            <div key={String(cfg.key)} className="px-5 py-3.5 flex items-start justify-between gap-3 hover:bg-zinc-800/20 transition-colors group">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-zinc-300 leading-none mb-0.5">{cfg.label}</div>
                <div className="text-[11px] text-zinc-600">{cfg.description}</div>
                <div className="text-xs font-mono text-zinc-400 mt-1">{ruleValueDisplay(cfg, settings)}</div>
              </div>
              <button
                type="button"
                onClick={() => onEdit(cfg)}
                className="flex-shrink-0 text-[10px] font-mono uppercase tracking-wider text-zinc-600 hover:text-violet-400 transition-colors opacity-0 group-hover:opacity-100 border border-zinc-800 hover:border-violet-500/40 px-2 py-1 rounded-lg"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="px-5 py-3 border-t border-zinc-800">
        <Link
          href="/dashboard/settings"
          className="w-full flex items-center justify-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors py-1.5"
        >
          All settings →
        </Link>
      </div>
    </div>
  );
}

// ── Filter Bar ────────────────────────────────────────────────────────────────

function FilterBar({
  decisions,
  onToggleDecision,
  period,
  onPeriodChange,
  search,
  onSearchChange,
  riskMin,
  onRiskMinChange,
  riskMax,
  onRiskMaxChange,
  sort,
  onSortChange,
}: {
  decisions: Set<LogEntry["decision"]>;
  onToggleDecision: (d: LogEntry["decision"]) => void;
  period: PeriodFilter;
  onPeriodChange: (p: PeriodFilter) => void;
  search: string;
  onSearchChange: (v: string) => void;
  riskMin: number;
  onRiskMinChange: (v: number) => void;
  riskMax: number;
  onRiskMaxChange: (v: number) => void;
  sort: SortOption;
  onSortChange: (v: SortOption) => void;
}) {
  const DECISIONS: LogEntry["decision"][] = ["allow", "block", "flag"];
  const decisionColors: Record<LogEntry["decision"], { active: string; inactive: string }> = {
    allow: { active: "bg-emerald-500/15 border-emerald-500/40 text-emerald-400", inactive: "border-zinc-700 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400" },
    block: { active: "bg-red-500/15 border-red-500/40 text-red-400",            inactive: "border-zinc-700 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400" },
    flag:  { active: "bg-amber-500/15 border-amber-500/40 text-amber-400",      inactive: "border-zinc-700 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400" },
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl px-5 py-4 space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        {/* Decision toggles */}
        <div className="flex items-center gap-1.5">
          {DECISIONS.map((d) => {
            const active = decisions.has(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => onToggleDecision(d)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border uppercase tracking-wide transition-colors ${active ? decisionColors[d].active : decisionColors[d].inactive}`}
              >
                {d}
              </button>
            );
          })}
        </div>

        <div className="w-px h-5 bg-zinc-700 hidden sm:block" />

        {/* Period */}
        <select
          value={period}
          onChange={(e) => onPeriodChange(e.target.value as PeriodFilter)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
        >
          <option value="all">All time</option>
          <option value="1h">Last 1h</option>
          <option value="24h">Last 24h</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>

        {/* Sort */}
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
        >
          <option value="date_desc">Newest first</option>
          <option value="risk_desc">Highest risk first</option>
          <option value="amount_desc">Largest amount first</option>
        </select>

        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-[180px] max-w-sm">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-xs">⌕</span>
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search intent_id, agent, recipient…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-7 pr-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/60 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors leading-none"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Risk score range */}
      <div className="flex items-center gap-3 text-xs">
        <span className="text-zinc-600 flex-shrink-0">Risk score</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={riskMin}
            min={0}
            max={riskMax}
            onChange={(e) => onRiskMinChange(Math.max(0, Math.min(riskMax, Number(e.target.value))))}
            className="w-14 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-center text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
          <span className="text-zinc-700">—</span>
          <input
            type="number"
            value={riskMax}
            min={riskMin}
            max={100}
            onChange={(e) => onRiskMaxChange(Math.max(riskMin, Math.min(100, Number(e.target.value))))}
            className="w-14 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-center text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          />
        </div>
      </div>
    </div>
  );
}

// ── Active filter badges ──────────────────────────────────────────────────────

function ActiveFilterBadges({
  decisions,
  onClearDecision,
  period,
  onClearPeriod,
  search,
  onClearSearch,
  riskMin,
  riskMax,
  onClearRisk,
  sort,
  onClearSort,
}: {
  decisions: Set<LogEntry["decision"]>;
  onClearDecision: () => void;
  period: PeriodFilter;
  onClearPeriod: () => void;
  search: string;
  onClearSearch: () => void;
  riskMin: number;
  riskMax: number;
  onClearRisk: () => void;
  sort: SortOption;
  onClearSort: () => void;
}) {
  const badges = [];
  const allDecisions: LogEntry["decision"][] = ["allow", "block", "flag"];

  if (decisions.size < 3) {
    const active = allDecisions.filter((d) => decisions.has(d));
    badges.push(
      <FilterBadge key="decision" label={active.map((d) => d.toUpperCase()).join(", ") || "None"} onRemove={onClearDecision} />
    );
  }
  if (period !== "all") {
    const labels = { "1h": "Last 1h", "24h": "Last 24h", "7d": "Last 7d", "30d": "Last 30d" };
    badges.push(<FilterBadge key="period" label={labels[period]} onRemove={onClearPeriod} />);
  }
  if (search) {
    badges.push(<FilterBadge key="search" label={`"${search.slice(0, 20)}${search.length > 20 ? "…" : ""}"`} onRemove={onClearSearch} />);
  }
  if (riskMin > 0 || riskMax < 100) {
    badges.push(<FilterBadge key="risk" label={`Risk ${riskMin}–${riskMax}`} onRemove={onClearRisk} />);
  }
  if (sort !== "date_desc") {
    const labels = { risk_desc: "Risk ↓", amount_desc: "Amount ↓" };
    badges.push(<FilterBadge key="sort" label={labels[sort as keyof typeof labels]} onRemove={onClearSort} />);
  }

  if (badges.length === 0) return null;
  return <div className="flex flex-wrap gap-2 items-center">{badges}</div>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // ── Data state ──────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [selectedDecisions, setSelectedDecisions] = useState<Set<LogEntry["decision"]>>(
    new Set(["allow", "block", "flag"])
  );
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [search, setSearch] = useState("");
  const [riskMin, setRiskMin] = useState(0);
  const [riskMax, setRiskMax] = useState(100);
  const [sort, setSort] = useState<SortOption>("date_desc");

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [editRuleCfg, setEditRuleCfg] = useState<RuleConfig | null>(null);
  const [triggeredLog, setTriggeredLog] = useState<LogEntry | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Data fetching ───────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/logs");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const { logs } = await res.json();
      setLogs(logs);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logs");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/workspace/settings");
      if (!res.ok) return;
      const { settings } = await res.json();
      if (settings) setSettings({ ...DEFAULT_SETTINGS, ...settings });
    } catch {
      // silently fail — sidebar shows loading state
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchSettings();
    const interval = setInterval(() => fetchLogs(true), 5000);
    return () => clearInterval(interval);
  }, [fetchLogs, fetchSettings]);

  // ── Filtering + sorting (client-side) ──────────────────────────────────────
  const filteredLogs = useMemo(() => {
    const cutoff = periodCutoff(period);
    const q = search.toLowerCase();

    const filtered = logs.filter((log) => {
      if (!selectedDecisions.has(log.decision)) return false;
      if (cutoff && new Date(log.created_at) < cutoff) return false;
      if (log.risk_score < riskMin || log.risk_score > riskMax) return false;
      if (q) {
        const match =
          log.intent_id.toLowerCase().includes(q) ||
          log.agent_id.toLowerCase().includes(q) ||
          log.recipient.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    if (sort === "risk_desc") filtered.sort((a, b) => b.risk_score - a.risk_score);
    else if (sort === "amount_desc") filtered.sort((a, b) => b.amount - a.amount);
    // date_desc is the default from the API

    return filtered;
  }, [logs, selectedDecisions, period, search, riskMin, riskMax, sort]);

  // ── Stats (on full data) ────────────────────────────────────────────────────
  const total = logs.length;
  const allowed = logs.filter((l) => l.decision === "allow").length;
  const blocked = logs.filter((l) => l.decision === "block").length;
  const flagged = logs.filter((l) => l.decision === "flag").length;

  // ── Settings save ───────────────────────────────────────────────────────────
  async function handleSaveRule(
    key: keyof WorkspaceSettings,
    value: WorkspaceSettings[keyof WorkspaceSettings]
  ) {
    const updated = { ...settings, [key]: value } as WorkspaceSettings;
    const res = await fetch("/api/v1/workspace/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      setSettings(updated);
      setEditRuleCfg(null);
      clearTimeout(toastTimer.current);
      setSaveToast("Rule updated");
      toastTimer.current = setTimeout(() => setSaveToast(null), 2500);
    }
  }

  const toggleDecision = (d: LogEntry["decision"]) => {
    setSelectedDecisions((prev) => {
      const next = new Set(prev);
      if (next.has(d)) { if (next.size > 1) next.delete(d); }
      else next.add(d);
      return next;
    });
  };

  return (
    <div className="min-h-screen text-white" style={{ background: "#09090e" }}>
      {/* ── Header ─────────────────────────────────── */}
      <header className="border-b border-zinc-800/60 bg-[#09090e]/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-xs font-bold">IG</div>
              <span className="font-bold text-lg tracking-tight group-hover:text-zinc-300 transition-colors">IntentGuard</span>
            </Link>
            <div className="hidden sm:block w-px h-5 bg-zinc-700" />
            <nav className="hidden sm:flex items-center gap-1">
              <Link href="/dashboard" className="text-sm text-white bg-zinc-800 px-3 py-1.5 rounded-lg">Logs</Link>
              <Link href="/dashboard/settings" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800">Settings</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live · 5s
            </div>
            {lastRefresh && (
              <span className="hidden sm:block text-xs text-zinc-600">
                {formatTime(lastRefresh.toISOString())}
              </span>
            )}
            <button
              onClick={() => fetchLogs()}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-8">
        {/* ── Stats ────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Checks", value: total, color: "text-white" },
            { label: "Allowed", value: allowed, color: "text-emerald-400", pct: total ? Math.round((allowed / total) * 100) : 0 },
            { label: "Blocked", value: blocked, color: "text-red-400", pct: total ? Math.round((blocked / total) * 100) : 0 },
            { label: "Flagged", value: flagged, color: "text-amber-400", pct: total ? Math.round((flagged / total) * 100) : 0 },
          ].map((s) => (
            <div key={s.label} className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">{s.label}</div>
              <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
              {"pct" in s && <div className="text-xs text-zinc-600 mt-1">{s.pct}% of total</div>}
            </div>
          ))}
        </div>

        {/* ── Error ────────────────────────────────── */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-5 py-4 mb-6 text-sm">
            <strong>Error loading logs:</strong> {error}
          </div>
        )}

        {/* ── Two-column layout ────────────────────── */}
        <div className="flex flex-col xl:flex-row gap-6">
          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-4">
            <FilterBar
              decisions={selectedDecisions}
              onToggleDecision={toggleDecision}
              period={period}
              onPeriodChange={setPeriod}
              search={search}
              onSearchChange={setSearch}
              riskMin={riskMin}
              onRiskMinChange={setRiskMin}
              riskMax={riskMax}
              onRiskMaxChange={setRiskMax}
              sort={sort}
              onSortChange={setSort}
            />

            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
              {/* Table header with counter + active badges */}
              <div className="px-5 py-3.5 border-b border-zinc-800 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <h2 className="font-semibold text-sm text-white flex-shrink-0">Verifications</h2>
                  <ActiveFilterBadges
                    decisions={selectedDecisions}
                    onClearDecision={() => setSelectedDecisions(new Set(["allow", "block", "flag"]))}
                    period={period}
                    onClearPeriod={() => setPeriod("all")}
                    search={search}
                    onClearSearch={() => setSearch("")}
                    riskMin={riskMin}
                    riskMax={riskMax}
                    onClearRisk={() => { setRiskMin(0); setRiskMax(100); }}
                    sort={sort}
                    onClearSort={() => setSort("date_desc")}
                  />
                </div>
                <span className="text-xs text-zinc-600 flex-shrink-0">
                  Showing <span className="text-zinc-400 font-medium">{filteredLogs.length}</span> of{" "}
                  <span className="text-zinc-400 font-medium">{total}</span>
                </span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-20 text-zinc-600 text-sm gap-3">
                  <div className="w-4 h-4 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
                  Loading logs…
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-600 text-sm gap-2">
                  {total === 0 ? (
                    <>
                      <span className="text-3xl">📭</span>
                      <p>No verifications yet.</p>
                      <p className="text-xs text-zinc-700">
                        Send a request to{" "}
                        <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">POST /api/verify</code>
                        {" "}to see logs here.
                      </p>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl">🔍</span>
                      <p>No results match your filters.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDecisions(new Set(["allow", "block", "flag"]));
                          setPeriod("all");
                          setSearch("");
                          setRiskMin(0);
                          setRiskMax(100);
                          setSort("date_desc");
                        }}
                        className="text-xs text-violet-400 hover:text-violet-300 transition-colors mt-1"
                      >
                        Clear all filters
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-zinc-600 uppercase tracking-wider">
                        <th className="text-left px-5 py-3 font-medium">Time</th>
                        <th className="text-left px-5 py-3 font-medium">Intent ID</th>
                        <th className="text-left px-5 py-3 font-medium hidden md:table-cell">Agent</th>
                        <th className="text-right px-5 py-3 font-medium">Amount</th>
                        <th className="text-left px-5 py-3 font-medium hidden lg:table-cell">Recipient</th>
                        <th className="text-center px-5 py-3 font-medium">Decision</th>
                        <th className="text-left px-5 py-3 font-medium hidden md:table-cell">Risk</th>
                        <th className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {filteredLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-zinc-800/30 transition-colors group">
                          <td className="px-5 py-4 text-zinc-500 whitespace-nowrap">
                            <div className="text-xs">{formatDate(log.created_at)}</div>
                            <div className="text-xs font-mono mt-0.5 text-zinc-600">{formatTime(log.created_at)}</div>
                          </td>
                          <td className="px-5 py-4">
                            <code className="text-xs font-mono text-zinc-400 bg-zinc-800/50 px-2 py-0.5 rounded">
                              {log.intent_id.length > 16 ? log.intent_id.slice(0, 16) + "…" : log.intent_id}
                            </code>
                          </td>
                          <td className="px-5 py-4 hidden md:table-cell">
                            <span className="text-zinc-400 text-xs">{log.agent_id}</span>
                          </td>
                          <td className="px-5 py-4 text-right font-mono font-medium whitespace-nowrap">
                            <span className="text-white">
                              {log.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-zinc-600 text-xs ml-1">{log.currency}</span>
                          </td>
                          <td className="px-5 py-4 hidden lg:table-cell">
                            <span className="text-zinc-400 text-xs truncate max-w-[140px] block">{log.recipient}</span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <DecisionBadge decision={log.decision} />
                          </td>
                          <td className="px-5 py-4 hidden md:table-cell">
                            <RiskBar score={log.risk_score} />
                          </td>
                          <td className="px-5 py-4 text-right whitespace-nowrap">
                            {(log.decision === "block" || log.decision === "flag") && log.triggered_rule && (
                              <button
                                type="button"
                                onClick={() => setTriggeredLog(log)}
                                className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 hover:text-amber-400 transition-colors border border-zinc-800 hover:border-amber-500/40 px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100"
                              >
                                View rule
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="text-center text-xs text-zinc-700">
              {total} total entries · auto-refreshes every 5 seconds
            </p>
          </div>

          {/* Sidebar */}
          <div className="xl:w-72 flex-shrink-0">
            <ActiveRulesPanel
              settings={settings}
              loading={settingsLoading}
              onEdit={setEditRuleCfg}
            />
          </div>
        </div>
      </main>

      {/* ── Modals ───────────────────────────────────── */}
      {editRuleCfg && settings && (
        <EditRuleModal
          cfg={editRuleCfg}
          settings={settings}
          onSave={handleSaveRule}
          onClose={() => setEditRuleCfg(null)}
        />
      )}

      {triggeredLog && (
        <TriggeredRuleModal
          log={triggeredLog}
          settings={settings}
          onAdjustRule={setEditRuleCfg}
          onClose={() => setTriggeredLog(null)}
        />
      )}

      {/* ── Save toast ───────────────────────────────── */}
      {saveToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-medium px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2">
          <span>✓</span>
          {saveToast}
        </div>
      )}
    </div>
  );
}
