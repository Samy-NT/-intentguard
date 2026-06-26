import type { DbRule, RuleResult } from "@/types";
import type { RuleContext } from "./types";

interface VelocityCountConfig {
  /** Sliding window duration in seconds */
  window_seconds: number;
  /** Maximum number of transactions in the window */
  max_count: number;
  /** Scope: per-agent, per-workspace, or per-recipient */
  scope: "agent" | "workspace" | "recipient";
}

interface VelocityAmountConfig {
  window_seconds: number;
  /** Maximum cumulative amount in the window */
  max_amount: number;
  currency?: string;
  scope: "agent" | "workspace" | "recipient";
}

function toFiniteAmount(value: unknown): number {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(amount) ? amount : 0;
}

/** Count-based velocity: max N transactions per window */
export async function evaluateVelocityCount(
  rule: DbRule,
  ctx: RuleContext
): Promise<RuleResult | null> {
  const { intent, db } = ctx;
  const cfg = rule.config as unknown as VelocityCountConfig;
  const since = new Date(Date.now() - cfg.window_seconds * 1000).toISOString();

  let query = db
    .from("verify_logs")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", intent.workspace_id)
    .gte("created_at", since)
    .in("decision", ["allow", "flag"]);

  if (cfg.scope === "agent") query = query.eq("agent_id", intent.agent_id);
  if (cfg.scope === "recipient") query = query.eq("recipient", intent.recipient);

  const { count, error } = await query;

  if (error) {
    // Fail open: log but don't block on DB errors
    console.error("[velocity_count] DB error:", error.message);
    return null;
  }

  if ((count ?? 0) >= cfg.max_count) {
    return {
      decision: "block",
      rule_id: rule.id,
      reason: `Velocity limit exceeded: ${count} transactions in the last ${cfg.window_seconds}s (max ${cfg.max_count}) for scope=${cfg.scope}`,
      risk_score: 95,
    };
  }

  return null;
}

/** Amount-based velocity: max cumulative N USD per window */
export async function evaluateVelocityAmount(
  rule: DbRule,
  ctx: RuleContext
): Promise<RuleResult | null> {
  const { intent, db } = ctx;
  const cfg = rule.config as unknown as VelocityAmountConfig;

  if (cfg.currency && cfg.currency !== intent.currency) return null;

  const since = new Date(Date.now() - cfg.window_seconds * 1000).toISOString();

  let query = db
    .from("verify_logs")
    .select("amount")
    .eq("workspace_id", intent.workspace_id)
    .eq("currency", intent.currency)
    .gte("created_at", since)
    .in("decision", ["allow", "flag"]);

  if (cfg.scope === "agent") query = query.eq("agent_id", intent.agent_id);
  if (cfg.scope === "recipient") query = query.eq("recipient", intent.recipient);

  const { data, error } = await query;

  if (error) {
    console.error("[velocity_amount] DB error:", error.message);
    return null;
  }

  const cumulative = (data ?? []).reduce((sum, row) => sum + toFiniteAmount(row.amount), 0);
  const total = cumulative + intent.amount;

  if (total > cfg.max_amount) {
    return {
      decision: "block",
      rule_id: rule.id,
      reason: `Velocity amount exceeded: cumulative ${cumulative} + current ${intent.amount} = ${total} ${intent.currency} > max ${cfg.max_amount} over ${cfg.window_seconds}s`,
      risk_score: 95,
    };
  }

  return null;
}
