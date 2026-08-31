import type { PaymentIntent, RuleDecision } from "@/types";
import type { AurelActionPolicy } from "@/lib/actions/evaluate";

// ─── Policy schema ────────────────────────────────────────────────────────────

export interface WorkspacePolicy {
  /** Block all crypto-like currencies when enabled. */
  block_crypto?: boolean;

  /** Maximum allowed transaction amount, assumed in the transaction currency. */
  max_amount_usd?: number;

  /** Daily amount cap displayed in settings; enforced through managed velocity rules. */
  max_amount_daily_usd?: number;

  /** Managed velocity settings synchronized into DB rules. */
  velocity_max_per_hour?: number;
  velocity_max_per_day?: number;
  velocity_max_amount_per_hour?: number;

  /** Recipient denylist from the settings UI. */
  blocked_recipients?: string[];

  /** Settings UI recipient allowlist. */
  allowed_recipients?: string[];

  /** Enables allowed_recipients as a closed-loop allowlist. */
  strict_recipients?: boolean;

  /** Known vendor caps from the settings UI. */
  known_vendors?: Array<{ name: string; max_amount: number }>;

  /** Per-agent caps from the settings UI. */
  per_agent_rules?: Array<{
    agent_id: string;
    max_amount: number;
    max_daily: number;
    allowed_recipients: string;
    active: boolean;
  }>;

  /**
   * Closed list of approved recipient identifiers (emails, wallet addresses…).
   * When defined, any recipient NOT in this list is blocked.
   */
  approved_recipients?: string[];

  /**
   * Allowed spending categories matched against `metadata.category`.
   * When defined, transactions with an absent or unlisted category are blocked.
   */
  allowed_categories?: string[];
  strict_categories?: boolean;

  /** Webhook escalation preferences from the settings UI. */
  escalate_on_block?: boolean;
  escalate_on_flag?: boolean;
  escalate_on_risk_score?: boolean;
  escalate_above_amount?: number;

  /** Per-category amount caps (currency of the transaction is assumed). */
  max_amount_by_category?: Record<string, number>;

  /** Time-window restrictions evaluated in the specified IANA timezone. */
  time_restrictions?: {
    timezone?: string; // e.g. "America/New_York" — defaults to UTC
    allowed_days?: Array<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun">;
    allowed_hours?: { start: number; end: number }; // 0-23 inclusive
  };

  /** Generic pre-tool action policy for agent framework integrations. */
  action_security?: AurelActionPolicy;
}

// ─── Result type ─────────────────────────────────────────────────────────────

export interface PolicyResult {
  decision: RuleDecision;
  reason: string;
  risk_score: number;
}

// ─── Main evaluator ───────────────────────────────────────────────────────────

/**
 * Evaluates a PaymentIntent against the workspace policy.
 * Returns a PolicyResult when the intent violates a policy rule, or null
 * when all checks pass (the intent is policy-compliant).
 */
export function evaluatePolicy(
  intent: PaymentIntent,
  policy: WorkspacePolicy
): PolicyResult | null {
  // 1. Universal transaction controls from the settings UI
  const universalViolation = checkUniversalControls(intent, policy);
  if (universalViolation) return universalViolation;

  // 2. Denylist / allowlist
  const blockedRecipientViolation = checkBlockedRecipients(intent, policy);
  if (blockedRecipientViolation) return blockedRecipientViolation;

  const recipientViolation = checkApprovedRecipients(intent, policy);
  if (recipientViolation) return recipientViolation;

  // 3. Per-agent policy
  const perAgentViolation = checkPerAgentRules(intent, policy);
  if (perAgentViolation) return perAgentViolation;

  // 4. Known vendor caps
  const vendorViolation = checkKnownVendors(intent, policy);
  if (vendorViolation) return vendorViolation;

  // 5. Allowed spending categories
  const categoryViolation = checkAllowedCategories(intent, policy);
  if (categoryViolation) return categoryViolation;

  // 6. Per-category amount caps
  const amountViolation = checkMaxAmountByCategory(intent, policy);
  if (amountViolation) return amountViolation;

  // 7. Time restrictions
  const timeViolation = checkTimeRestrictions(policy);
  if (timeViolation) return timeViolation;

  return null;
}

// ─── Sub-checks ───────────────────────────────────────────────────────────────

function checkUniversalControls(
  intent: PaymentIntent,
  policy: WorkspacePolicy
): PolicyResult | null {
  if (policy.block_crypto && ["BTC", "ETH", "USDC", "USDT"].includes(intent.currency.toUpperCase())) {
    return {
      decision: "block",
      reason: `Crypto transaction blocked by workspace policy (${intent.currency})`,
      risk_score: 95,
    };
  }

  if (typeof policy.max_amount_usd === "number" && intent.amount > policy.max_amount_usd) {
    return {
      decision: "block",
      reason: `Amount ${intent.amount} ${intent.currency} exceeds workspace max transaction amount of ${policy.max_amount_usd}`,
      risk_score: 100,
    };
  }

  return null;
}

function checkBlockedRecipients(
  intent: PaymentIntent,
  policy: WorkspacePolicy
): PolicyResult | null {
  if (!policy.blocked_recipients?.length) return null;

  if (policy.blocked_recipients.includes(intent.recipient)) {
    return {
      decision: "block",
      reason: `Recipient "${intent.recipient}" is blocked by workspace policy`,
      risk_score: 100,
    };
  }

  return null;
}

function checkApprovedRecipients(
  intent: PaymentIntent,
  policy: WorkspacePolicy
): PolicyResult | null {
  const approvedRecipients =
    policy.approved_recipients?.length
      ? policy.approved_recipients
      : policy.strict_recipients
      ? policy.allowed_recipients
      : undefined;

  if (!approvedRecipients?.length) return null;

  if (!approvedRecipients.includes(intent.recipient)) {
    return {
      decision: "block",
      reason: `Recipient "${intent.recipient}" is not in the workspace approved vendor list`,
      risk_score: 100,
    };
  }
  return null;
}

function checkPerAgentRules(
  intent: PaymentIntent,
  policy: WorkspacePolicy
): PolicyResult | null {
  const rule = policy.per_agent_rules?.find((r) => r.active && r.agent_id === intent.agent_id);
  if (!rule) return null;

  if (typeof rule.max_amount === "number" && intent.amount > rule.max_amount) {
    return {
      decision: "block",
      reason: `Amount ${intent.amount} ${intent.currency} exceeds per-agent cap of ${rule.max_amount} for ${intent.agent_id}`,
      risk_score: 95,
    };
  }

  const allowedRecipients = rule.allowed_recipients
    .split(/[,\n]/)
    .map((recipient) => recipient.trim())
    .filter(Boolean);
  if (allowedRecipients.length > 0 && !allowedRecipients.includes(intent.recipient)) {
    return {
      decision: "block",
      reason: `Recipient "${intent.recipient}" is not allowed for agent ${intent.agent_id}`,
      risk_score: 90,
    };
  }

  return null;
}

function checkKnownVendors(
  intent: PaymentIntent,
  policy: WorkspacePolicy
): PolicyResult | null {
  const vendor = policy.known_vendors?.find((v) => v.name === intent.recipient || v.name === intent.merchant_id);
  if (!vendor) return null;

  if (typeof vendor.max_amount === "number" && intent.amount > vendor.max_amount) {
    return {
      decision: "block",
      reason: `Amount ${intent.amount} ${intent.currency} exceeds vendor cap of ${vendor.max_amount} for "${vendor.name}"`,
      risk_score: 95,
    };
  }

  return null;
}

function checkAllowedCategories(
  intent: PaymentIntent,
  policy: WorkspacePolicy
): PolicyResult | null {
  if (policy.strict_categories !== true || !policy.allowed_categories?.length) return null;

  const category = intent.metadata?.category as string | undefined;

  if (!category) {
    return {
      decision: "block",
      reason: `Transaction has no spending category — workspace policy requires one of: ${policy.allowed_categories.join(", ")}`,
      risk_score: 85,
    };
  }

  if (!policy.allowed_categories.includes(category)) {
    return {
      decision: "block",
      reason: `Spending category "${category}" is not permitted by workspace policy (allowed: ${policy.allowed_categories.join(", ")})`,
      risk_score: 90,
    };
  }
  return null;
}

function checkMaxAmountByCategory(
  intent: PaymentIntent,
  policy: WorkspacePolicy
): PolicyResult | null {
  if (!policy.max_amount_by_category) return null;

  const category = intent.metadata?.category as string | undefined;
  if (!category) return null;

  const limit = policy.max_amount_by_category[category];
  if (limit === undefined) return null;

  if (intent.amount > limit) {
    return {
      decision: "block",
      reason: `Amount ${intent.amount} ${intent.currency} exceeds the workspace policy cap of ${limit} for category "${category}"`,
      risk_score: 95,
    };
  }
  return null;
}

function checkTimeRestrictions(policy: WorkspacePolicy): PolicyResult | null {
  const tr = policy.time_restrictions;
  if (!tr) return null;

  const { hour, day } = getNowInTimezone(tr.timezone ?? "UTC");

  if (tr.allowed_days?.length && !tr.allowed_days.includes(day as WorkspacePolicy["time_restrictions"] extends { allowed_days?: Array<infer D> } ? D : never)) {
    return {
      decision: "block",
      reason: `Transactions are not permitted on ${day} per workspace policy (allowed: ${tr.allowed_days.join(", ")})`,
      risk_score: 75,
    };
  }

  if (tr.allowed_hours) {
    const { start, end } = tr.allowed_hours;
    const inRange =
      start <= end ? hour >= start && hour < end : hour >= start || hour < end;

    if (!inRange) {
      const tz = tr.timezone ?? "UTC";
      return {
        decision: "block",
        reason: `Transactions are not permitted at ${String(hour).padStart(2, "0")}:00 ${tz} — workspace policy allows ${start}:00–${end}:00`,
        risk_score: 75,
      };
    }
  }

  return null;
}

// ─── Timezone helper ─────────────────────────────────────────────────────────

function getNowInTimezone(timezone: string): { hour: number; day: string } {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      weekday: "short",
      hour12: false,
    }).formatToParts(now);

    const h = parts.find((p) => p.type === "hour")?.value ?? "0";
    const w = parts.find((p) => p.type === "weekday")?.value ?? "";
    return {
      hour: parseInt(h, 10) % 24, // guard against "24" returned for midnight in some runtimes
      day: w.toLowerCase().slice(0, 3) as string,
    };
  } catch {
    console.error(`[policy] Invalid timezone "${timezone}", falling back to UTC`);
    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
    return { hour: now.getUTCHours(), day: days[now.getUTCDay()] };
  }
}
