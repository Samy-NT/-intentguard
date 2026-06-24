import type { DbRule, RuleResult } from "@/types";
import type { RuleContext } from "./types";

interface AmountThresholdConfig {
  /** Maximum allowed amount for a single transaction */
  max_per_transaction?: number;
  /** Soft limit that raises risk score without blocking */
  soft_limit?: number;
  /** Currency this rule applies to; omit to apply to all */
  currency?: string;
  /** 0–100 risk score to add when soft limit is breached */
  soft_limit_risk_score?: number;
}

export async function evaluateAmountThreshold(
  rule: DbRule,
  ctx: RuleContext
): Promise<RuleResult | null> {
  const { intent } = ctx;
  const cfg = rule.config as AmountThresholdConfig;

  if (cfg.currency && cfg.currency !== intent.currency) return null;

  if (cfg.max_per_transaction !== undefined && intent.amount > cfg.max_per_transaction) {
    return {
      decision: "block",
      rule_id: rule.id,
      reason: `Amount ${intent.amount} ${intent.currency} exceeds maximum per-transaction limit of ${cfg.max_per_transaction}`,
      risk_score: 100,
    };
  }

  if (cfg.soft_limit !== undefined && intent.amount > cfg.soft_limit) {
    return {
      decision: "flag",
      rule_id: rule.id,
      reason: `Amount ${intent.amount} ${intent.currency} exceeds soft limit of ${cfg.soft_limit} — flagged for review`,
      risk_score: cfg.soft_limit_risk_score ?? 60,
    };
  }

  return null;
}
