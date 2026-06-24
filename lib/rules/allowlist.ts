import type { DbRule, RuleResult } from "@/types";
import type { RuleContext } from "./types";

interface ListConfig {
  /** List of merchant_id or recipient values */
  entries: string[];
  /** Which field to match against */
  field: "merchant_id" | "recipient";
}

/** Returns deny if the target appears in the denylist */
export async function evaluateDenylist(
  rule: DbRule,
  ctx: RuleContext
): Promise<RuleResult | null> {
  const { intent } = ctx;
  const cfg = rule.config as unknown as ListConfig;
  const value = cfg.field === "merchant_id" ? intent.merchant_id : intent.recipient;

  if (!value) return null;

  if (cfg.entries.includes(value)) {
    return {
      decision: "block",
      rule_id: rule.id,
      reason: `${cfg.field} "${value}" is on the denylist`,
      risk_score: 100,
    };
  }

  return null;
}

/**
 * Returns deny if the target is NOT in the allowlist.
 * Useful for closed-loop payment systems.
 */
export async function evaluateAllowlist(
  rule: DbRule,
  ctx: RuleContext
): Promise<RuleResult | null> {
  const { intent } = ctx;
  const cfg = rule.config as unknown as ListConfig;
  const value = cfg.field === "merchant_id" ? intent.merchant_id : intent.recipient;

  // If no value to match, skip (don't block transactions that don't have this field)
  if (!value) return null;

  if (!cfg.entries.includes(value)) {
    return {
      decision: "block",
      rule_id: rule.id,
      reason: `${cfg.field} "${value}" is not in the allowlist`,
      risk_score: 100,
    };
  }

  return null;
}
