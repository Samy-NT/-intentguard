import { type NextRequest } from "next/server";
import { requireCronSecret } from "@/app/api/cron/_auth";
import { createServerClient } from "@/lib/supabase/server";

interface WorkspaceRow {
  id: string;
  policy: Record<string, unknown> | null;
}

function retentionDays(policy: Record<string, unknown> | null): number {
  const value = policy?.log_retention_days;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 90;
}

export async function runRetentionCron() {
  const db = createServerClient();
  const { data, error } = await db.from("workspaces").select("id, policy");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let deleted = 0;
  let deletedEntitlementReservations = 0;
  let deletedEntitlementCounters = 0;
  let deletedActionAudits = 0;
  let deletedActionTelemetry = 0;
  for (const ws of (data ?? []) as WorkspaceRow[]) {
    const cutoff = new Date(Date.now() - retentionDays(ws.policy) * 86_400_000).toISOString();
    const { count, error: deleteError } = await db
      .from("verify_logs")
      .delete({ count: "exact" })
      .eq("workspace_id", ws.id)
      .lt("created_at", cutoff);

    if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
    deleted += count ?? 0;

    const { count: reservationCount, error: reservationError } = await db
      .from("verification_usage_reservations")
      .delete({ count: "exact" })
      .eq("workspace_id", ws.id)
      .lt("reserved_at", cutoff);
    if (reservationError) return Response.json({ error: reservationError.message }, { status: 500 });
    deletedEntitlementReservations += reservationCount ?? 0;

    const { count: counterCount, error: counterError } = await db
      .from("verification_usage_counters")
      .delete({ count: "exact" })
      .eq("workspace_id", ws.id)
      .lt("period_start", cutoff);
    if (counterError) return Response.json({ error: counterError.message }, { status: 500 });
    deletedEntitlementCounters += counterCount ?? 0;

    const { count: actionAuditCount, error: actionAuditError } = await db
      .from("action_audit_logs")
      .delete({ count: "exact" })
      .eq("workspace_id", ws.id)
      .lt("created_at", cutoff);
    if (actionAuditError) return Response.json({ error: actionAuditError.message }, { status: 500 });
    deletedActionAudits += actionAuditCount ?? 0;

    const { count: telemetryCount, error: telemetryError } = await db
      .from("action_telemetry_events")
      .delete({ count: "exact" })
      .eq("workspace_id", ws.id)
      .lt("created_at", cutoff);
    if (telemetryError) return Response.json({ error: telemetryError.message }, { status: 500 });
    deletedActionTelemetry += telemetryCount ?? 0;
  }

  return Response.json({
    success: true,
    deleted,
    deleted_entitlement_reservations: deletedEntitlementReservations,
    deleted_entitlement_counters: deletedEntitlementCounters,
    deleted_action_audits: deletedActionAudits,
    deleted_action_telemetry: deletedActionTelemetry,
  });
}

export async function POST(req: NextRequest) {
  const auth = requireCronSecret(req);
  if (auth) return auth;
  return runRetentionCron();
}

export const GET = POST;
