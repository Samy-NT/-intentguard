import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AurelActionTelemetry } from "@/lib/actions/protocol";
import { canonicalizeAuditValue } from "@/lib/audit";
import { redactForTelemetry } from "@/lib/actions/redaction";

export function hashTelemetryEvent(telemetry: AurelActionTelemetry): string {
  return createHash("sha256").update(canonicalizeAuditValue(telemetry)).digest("hex");
}

export function buildTelemetryRow(workspaceId: string, telemetry: AurelActionTelemetry) {
  return {
    workspace_id: workspaceId,
    action_id: telemetry.actionId,
    integration: telemetry.integration,
    trace_id: telemetry.traceId ?? null,
    agent_id: telemetry.agent?.id ?? null,
    outcome_status: telemetry.outcome.status,
    duration_ms: telemetry.outcome.durationMs ?? null,
    error_category: telemetry.outcome.errorCategory ?? null,
    timings: redactForTelemetry(telemetry.timings ?? {}, { maxBytes: 4096 }),
    metadata: redactForTelemetry(telemetry.metadata ?? {}, { maxBytes: 8192 }),
    event_hash: hashTelemetryEvent(telemetry),
    created_at: telemetry.timestamp,
  };
}

export async function persistTelemetry(db: SupabaseClient, workspaceId: string, telemetry: AurelActionTelemetry) {
  if (typeof (db as unknown as { from?: unknown }).from !== "function") return { error: null, available: false };
  const row = buildTelemetryRow(workspaceId, telemetry);
  const { error } = await db.from("action_telemetry_events").upsert(row, { onConflict: "workspace_id,event_hash", ignoreDuplicates: true });
  return { error: error?.message ?? null, available: true };
}
