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

interface AtomicReservationRow {
  allowed: boolean;
  used: number | string;
  limit_value: number | string | null;
  already_reserved: boolean;
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

/**
 * Atomically reserves one verification entitlement for an intent.
 *
 * The SQL RPC serializes reservations per workspace/period and binds the
 * reservation to intent_id, so concurrent requests cannot oversubscribe a
 * monthly limit or consume two slots for the same idempotent request.
 * Lightweight test doubles from older callers can still use the read-only
 * evaluator; a real Supabase client always exposes rpc and therefore fails
 * closed when the migration is missing.
 */
export async function reserveWorkspaceVerification(
  db: SupabaseClient,
  workspaceId: string,
  intentId: string,
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
  const periodStart = policyPeriodStart(policy ?? {}, now);
  if (limit === null) {
    return {
      allowed: true,
      status: 200,
      reason: "Workspace verification entitlement allows unlimited usage.",
      usage: { period_start: periodStart, used: 0, limit: null },
    };
  }

  const rpc = (db as SupabaseClient & { rpc?: (...args: unknown[]) => unknown }).rpc;
  if (typeof rpc !== "function") {
    return evaluateWorkspaceEntitlements(db, workspaceId, policy, now);
  }

  try {
    const result = await db.rpc("reserve_workspace_verification", {
      p_workspace_id: workspaceId,
      p_period_start: periodStart,
      p_intent_id: intentId,
      p_limit: limit,
    });
    const { data, error } = result as { data: AtomicReservationRow[] | AtomicReservationRow | null; error: { message: string } | null };
    if (error) {
      return {
        allowed: false,
        status: 503,
        reason: `Unable to reserve workspace verification entitlement: ${error.message}`,
      };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== "boolean") {
      return {
        allowed: false,
        status: 503,
        reason: "Unable to reserve workspace verification entitlement: invalid reservation response",
      };
    }

    const used = Number(row.used) || 0;
    const resolvedLimit = row.limit_value === null ? limit : Number(row.limit_value) || limit;
    return {
      allowed: row.allowed,
      status: row.allowed ? 200 : 402,
      reason: row.allowed
        ? row.already_reserved
          ? "Workspace verification entitlement was already reserved for this intent."
          : "Workspace verification entitlement allows this request."
        : `Workspace monthly verification limit reached (${used}/${resolvedLimit}).`,
      usage: { period_start: periodStart, used, limit: resolvedLimit },
    };
  } catch (error) {
    return {
      allowed: false,
      status: 503,
      reason: `Unable to reserve workspace verification entitlement: ${error instanceof Error ? error.message : "RPC failed"}`,
    };
  }
}
