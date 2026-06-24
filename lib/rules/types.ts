import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbRule, PaymentIntent, RuleResult } from "@/types";

export interface RuleContext {
  intent: PaymentIntent;
  db: SupabaseClient;
}

export type RuleEvaluator = (
  rule: DbRule,
  ctx: RuleContext
) => Promise<RuleResult | null>;
