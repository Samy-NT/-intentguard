import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbRule, PaymentIntent, RuleDecision, RuleResult } from "@/types";
import { evaluateAmountThreshold } from "./amount";
import { evaluateAllowlist, evaluateDenylist } from "./allowlist";
import { evaluateVelocityAmount, evaluateVelocityCount } from "./velocity";
import type { RuleEvaluator, RuleContext } from "./types";

const EVALUATORS: Record<DbRule["rule_type"], RuleEvaluator> = {
  amount_threshold: evaluateAmountThreshold,
  denylist: evaluateDenylist,
  allowlist: evaluateAllowlist,
  velocity_count: evaluateVelocityCount,
  velocity_amount: evaluateVelocityAmount,
};

const DECISION_PRIORITY: Record<RuleDecision, number> = {
  block: 2,
  flag: 1,
  allow: 0,
};

export interface EngineResult {
  decision: RuleDecision;
  triggered_rule: string | null;
  reason: string;
  risk_score: number;
  all_results: RuleResult[];
}

/**
 * Runs all active rules for a workspace ordered by priority.
 * First "deny" short-circuits. Highest risk score wins for "review".
 */
export async function runRuleEngine(
  intent: PaymentIntent,
  db: SupabaseClient
): Promise<EngineResult> {
  const { data: rules, error } = await db
    .from("rules")
    .select("*")
    .eq("workspace_id", intent.workspace_id)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error) {
    throw new Error(`Failed to load rules: ${error.message}`);
  }

  if (!rules || rules.length === 0) {
    return {
      decision: "allow",
      triggered_rule: null,
      reason: "No active rules found — default allow",
      risk_score: 0,
      all_results: [],
    };
  }

  const ctx: RuleContext = { intent, db };
  const results: RuleResult[] = [];

  for (const rule of rules as DbRule[]) {
    const evaluator = EVALUATORS[rule.rule_type];
    if (!evaluator) continue;

    const result = await evaluator(rule, ctx);
    if (!result) continue;

    results.push(result);

    // Short-circuit on first block
    if (result.decision === "block") {
      return {
        decision: "block",
        triggered_rule: result.rule_id,
        reason: result.reason,
        risk_score: result.risk_score,
        all_results: results,
      };
    }
  }

  if (results.length === 0) {
    return {
      decision: "allow",
      triggered_rule: null,
      reason: "All rules passed",
      risk_score: 0,
      all_results: [],
    };
  }

  // Aggregate: pick worst outcome across all triggered rules
  const worst = results.reduce((acc, r) =>
    DECISION_PRIORITY[r.decision] > DECISION_PRIORITY[acc.decision] ? r : acc
  );

  return {
    decision: worst.decision,
    triggered_rule: worst.rule_id,
    reason: worst.reason,
    risk_score: Math.max(...results.map((r) => r.risk_score)),
    all_results: results,
  };
}
