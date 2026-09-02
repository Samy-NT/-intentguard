import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspacePolicy } from "@/lib/policies/evaluate";
import type { DbRule } from "@/types";
import { normalizeMonthlyVerificationLimit, normalizeWorkspaceStatus } from "@/lib/entitlements";

type ManagedRuleKey =
  | "settings_amount_threshold"
  | "settings_denylist"
  | "settings_allowlist"
  | "settings_velocity_count_hour"
  | "settings_velocity_count_day"
  | "settings_velocity_amount_hour"
  | "settings_velocity_amount_day";

interface ManagedRuleSpec {
  key: ManagedRuleKey;
  rule_type: DbRule["rule_type"];
  priority: number;
  is_active: boolean;
  config: Record<string, unknown>;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function actionDecision(value: unknown, fallback: "allow" | "require_approval" | "block") {
  return value === "allow" || value === "require_approval" || value === "block" ? value : fallback;
}

function normalizeActionSecurity(value: unknown): WorkspacePolicy["action_security"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const maxRiskScore = numberOr(raw.max_risk_score, 90);

  return {
    blocked_tools: stringArray(raw.blocked_tools),
    approval_required_tools: stringArray(raw.approval_required_tools),
    strict_tools: raw.strict_tools === true,
    allowed_tools: stringArray(raw.allowed_tools),
    blocked_argument_patterns: stringArray(raw.blocked_argument_patterns),
    approval_argument_patterns: stringArray(raw.approval_argument_patterns),
    blocked_paths: stringArray(raw.blocked_paths),
    approval_paths: stringArray(raw.approval_paths),
    high_risk: actionDecision(raw.high_risk, "require_approval"),
    medium_risk: actionDecision(raw.medium_risk, "allow"),
    max_risk_score: Math.min(100, Math.max(0, maxRiskScore)),
    policy_version: typeof raw.policy_version === "string" && raw.policy_version.trim() ? raw.policy_version : "actions-v1",
  };
}

export function normalizeWorkspacePolicy(raw: Record<string, unknown>): WorkspacePolicy {
  const allowedRecipients = stringArray(raw.allowed_recipients);
  const blockedRecipients = stringArray(raw.blocked_recipients);
  const strictRecipients = raw.strict_recipients === true;
  const blockWeekends = raw.block_weekends === true;
  const allowedHours = raw.allowed_hours;

  const policy: WorkspacePolicy = {
    ...raw,
    workspace_status: normalizeWorkspaceStatus(raw.workspace_status),
    billing_plan: typeof raw.billing_plan === "string" && raw.billing_plan.trim() ? raw.billing_plan.trim() : "pilot",
    monthly_verification_limit: normalizeMonthlyVerificationLimit(raw.monthly_verification_limit),
    limit_period_start:
      typeof raw.limit_period_start === "string" && !Number.isNaN(Date.parse(raw.limit_period_start))
        ? new Date(raw.limit_period_start).toISOString()
        : undefined,
    blocked_recipients: blockedRecipients,
    strict_recipients: strictRecipients,
    block_crypto: raw.block_crypto === true,
    max_amount_usd: numberOr(raw.max_amount_usd, 10_000),
    max_amount_daily_usd: numberOr(raw.max_amount_daily_usd, 50_000),
    velocity_max_per_hour: numberOr(raw.velocity_max_per_hour, 10),
    velocity_max_per_day: numberOr(raw.velocity_max_per_day, 50),
    velocity_max_amount_per_hour: numberOr(raw.velocity_max_amount_per_hour, 10_000),
    approved_recipients: strictRecipients ? allowedRecipients : undefined,
    allowed_recipients: allowedRecipients,
    action_security: normalizeActionSecurity(raw.action_security),
  };

  if (blockWeekends || (allowedHours && typeof allowedHours === "object")) {
    const hours = allowedHours as { start?: unknown; end?: unknown; timezone?: unknown };
    policy.time_restrictions = {
      timezone: typeof hours.timezone === "string" ? hours.timezone : "UTC",
      allowed_days: blockWeekends ? ["mon", "tue", "wed", "thu", "fri"] : undefined,
      allowed_hours:
        typeof hours.start === "number" && typeof hours.end === "number"
          ? { start: hours.start, end: hours.end }
          : undefined,
    };
  }

  return policy;
}

function managedConfig(key: ManagedRuleKey, config: Record<string, unknown>): Record<string, unknown> {
  return {
    ...config,
    managed_by: "settings",
    managed_key: key,
  };
}

export function buildManagedRules(policy: WorkspacePolicy): ManagedRuleSpec[] {
  const blockedRecipients = stringArray(policy.blocked_recipients);
  const approvedRecipients = stringArray(policy.allowed_recipients);
  const maxAmount = numberOr(policy.max_amount_usd, 10_000);
  const velocityHour = numberOr(policy.velocity_max_per_hour, 10);
  const velocityDay = numberOr(policy.velocity_max_per_day, 50);
  const velocityAmountHour = numberOr(policy.velocity_max_amount_per_hour, 10_000);
  const velocityAmountDay = numberOr(policy.max_amount_daily_usd, 50_000);

  return [
    {
      key: "settings_amount_threshold",
      rule_type: "amount_threshold",
      priority: 10,
      is_active: maxAmount > 0,
      config: managedConfig("settings_amount_threshold", {
        max_per_transaction: maxAmount,
        soft_limit: Math.max(1, Math.round(maxAmount * 0.75)),
        soft_limit_risk_score: 60,
      }),
    },
    {
      key: "settings_denylist",
      rule_type: "denylist",
      priority: 20,
      is_active: blockedRecipients.length > 0,
      config: managedConfig("settings_denylist", {
        field: "recipient",
        entries: blockedRecipients,
      }),
    },
    {
      key: "settings_allowlist",
      rule_type: "allowlist",
      priority: 25,
      is_active: policy.strict_recipients === true && approvedRecipients.length > 0,
      config: managedConfig("settings_allowlist", {
        field: "recipient",
        entries: approvedRecipients,
      }),
    },
    {
      key: "settings_velocity_count_hour",
      rule_type: "velocity_count",
      priority: 30,
      is_active: velocityHour > 0,
      config: managedConfig("settings_velocity_count_hour", {
        window_seconds: 3600,
        max_count: velocityHour,
        scope: "agent",
      }),
    },
    {
      key: "settings_velocity_count_day",
      rule_type: "velocity_count",
      priority: 31,
      is_active: velocityDay > 0,
      config: managedConfig("settings_velocity_count_day", {
        window_seconds: 86400,
        max_count: velocityDay,
        scope: "agent",
      }),
    },
    {
      key: "settings_velocity_amount_hour",
      rule_type: "velocity_amount",
      priority: 32,
      is_active: velocityAmountHour > 0,
      config: managedConfig("settings_velocity_amount_hour", {
        window_seconds: 3600,
        max_amount: velocityAmountHour,
        scope: "agent",
      }),
    },
    {
      key: "settings_velocity_amount_day",
      rule_type: "velocity_amount",
      priority: 33,
      is_active: velocityAmountDay > 0,
      config: managedConfig("settings_velocity_amount_day", {
        window_seconds: 86400,
        max_amount: velocityAmountDay,
        scope: "agent",
      }),
    },
  ];
}

export async function syncManagedRules(
  db: SupabaseClient,
  workspaceId: string,
  policy: WorkspacePolicy
): Promise<{ error: string | null }> {
  const desiredRules = buildManagedRules(policy);
  const { data: existing, error } = await db
    .from("rules")
    .select("id, rule_type, config")
    .eq("workspace_id", workspaceId);

  if (error) return { error: error.message };

  const existingByKey = new Map<string, { id: string }>();
  for (const rule of (existing ?? []) as Array<{ id: string; config: Record<string, unknown> }>) {
    if (rule.config?.managed_by === "settings" && typeof rule.config.managed_key === "string") {
      existingByKey.set(rule.config.managed_key, { id: rule.id });
    }
  }

  for (const rule of desiredRules) {
    const existingRule = existingByKey.get(rule.key);
    if (existingRule) {
      const { error: updateError } = await db
        .from("rules")
        .update({
          rule_type: rule.rule_type,
          priority: rule.priority,
          is_active: rule.is_active,
          config: rule.config,
        })
        .eq("id", existingRule.id)
        .eq("workspace_id", workspaceId);
      if (updateError) return { error: updateError.message };
    } else {
      const { error: insertError } = await db.from("rules").insert({
        workspace_id: workspaceId,
        rule_type: rule.rule_type,
        priority: rule.priority,
        is_active: rule.is_active,
        config: rule.config,
      });
      if (insertError) return { error: insertError.message };
    }
  }

  return { error: null };
}
