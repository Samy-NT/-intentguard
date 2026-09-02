import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspacePolicy } from "@/lib/policies/evaluate";

export type WorkspaceStatus = "active" | "trialing" | "past_due" | "suspended";

export interface EntitlementDecision {
  allowed: boolean;
  status: number;
  reason: string;
  usage?: {
    period_start: string;
    used: number;
    limit: number | null;
  };
}

export function normalizeWorkspaceStatus(value: unknown): WorkspaceStatus {
  return value === "trialing" || value === "past_due" || value === "suspended" || value === "active"
    ? value
    : "active";
}

export function normalizeMonthlyVerificationLimit(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const integer = Math.floor(value);
  return integer > 0 ? integer : null;
}

export function currentUsagePeriodStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function policyPeriodStart(policy: WorkspacePolicy, now: Date): string {
  return typeof policy.limit_period_start === "string" && !Number.isNaN(Date.parse(policy.limit_period_start))
    ? new Date(policy.limit_period_start).toISOString()
    : currentUsagePeriodStart(now);
}

export async function evaluateWorkspaceEntitlements(
  db: SupabaseClient,
  workspaceId: string,
  policy: WorkspacePolicy | null,
  now = new Date()
): Promise<EntitlementDecision> {
  const workspaceStatus = normalizeWorkspaceStatus(policy?.workspace_status);
  if (workspaceStatus === "suspended") {
    return {
      allowed: false,
      status: 403,
      reason: "Workspace is suspended. Verification is disabled until access is restored.",
    };
  }

  const limit = normalizeMonthlyVerificationLimit(policy?.monthly_verification_limit);
  if (limit === null) {
    return {
      allowed: true,
      status: 200,
      reason: "Workspace verification entitlement allows unlimited usage.",
      usage: {
        period_start: policyPeriodStart(policy ?? {}, now),
        used: 0,
        limit: null,
      },
    };
  }

  const periodStart = policyPeriodStart(policy ?? {}, now);
  const { count, error } = await db
    .from("verify_logs")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gte("created_at", periodStart);

  if (error) {
    return {
      allowed: false,
      status: 503,
      reason: `Unable to check workspace usage entitlement: ${error.message}`,
    };
  }

  const used = count ?? 0;
  if (used >= limit) {
    return {
      allowed: false,
      status: 402,
      reason: `Workspace monthly verification limit reached (${used}/${limit}).`,
      usage: {
        period_start: periodStart,
        used,
        limit,
      },
    };
  }

  return {
    allowed: true,
    status: 200,
    reason: "Workspace verification entitlement allows this request.",
    usage: {
      period_start: periodStart,
      used,
      limit,
    },
  };
}
