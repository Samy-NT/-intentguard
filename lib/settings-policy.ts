import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspacePolicy } from "@/lib/policies/evaluate";
import type { DbRule } from "@/types";

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

export function normalizeWorkspacePolicy(raw: Record<string, unknown>): WorkspacePolicy {
  const allowedRecipients = stringArray(raw.allowed_recipients);
  const blockedRecipients = stringArray(raw.blocked_recipients);
  const strictRecipients = raw.strict_recipients === true;
  const blockWeekends = raw.block_weekends === true;
  const allowedHours = raw.allowed_hours;

  const policy: WorkspacePolicy = {
    ...raw,
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
