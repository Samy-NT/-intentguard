import type { PaymentIntent, RuleDecision } from "@/types";

// ─── Policy schema ────────────────────────────────────────────────────────────

export interface WorkspacePolicy {
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

  /** Per-category amount caps (currency of the transaction is assumed). */
  max_amount_by_category?: Record<string, number>;

  /** Time-window restrictions evaluated in the specified IANA timezone. */
  time_restrictions?: {
    timezone?: string; // e.g. "America/New_York" — defaults to UTC
    allowed_days?: Array<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun">;
    allowed_hours?: { start: number; end: number }; // 0-23 inclusive
  };
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
  // 1. Approved recipients
  const recipientViolation = checkApprovedRecipients(intent, policy);
  if (recipientViolation) return recipientViolation;

  // 2. Allowed spending categories
  const categoryViolation = checkAllowedCategories(intent, policy);
  if (categoryViolation) return categoryViolation;

  // 3. Per-category amount caps
  const amountViolation = checkMaxAmountByCategory(intent, policy);
  if (amountViolation) return amountViolation;

  // 4. Time restrictions
  const timeViolation = checkTimeRestrictions(policy);
  if (timeViolation) return timeViolation;

  return null;
}

// ─── Sub-checks ───────────────────────────────────────────────────────────────

function checkApprovedRecipients(
  intent: PaymentIntent,
  policy: WorkspacePolicy
): PolicyResult | null {
  if (!policy.approved_recipients?.length) return null;

  if (!policy.approved_recipients.includes(intent.recipient)) {
    return {
      decision: "block",
      reason: `Recipient "${intent.recipient}" is not in the workspace approved vendor list`,
      risk_score: 100,
    };
  }
  return null;
}

function checkAllowedCategories(
  intent: PaymentIntent,
  policy: WorkspacePolicy
): PolicyResult | null {
  if (!policy.allowed_categories?.length) return null;

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
