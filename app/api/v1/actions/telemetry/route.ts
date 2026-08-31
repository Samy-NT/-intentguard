import { authenticateRequest, requireRole } from "@/lib/auth";
import { AurelActionTelemetrySchema } from "@/lib/actions/protocol";
import { err, json } from "@/lib/respond";
import { captureError, recordLayerMetric } from "@/lib/monitoring";
import { readBoundedJsonBody } from "@/lib/http/body";
import { validateIdempotencyKeyHeader } from "@/lib/http/idempotency";
import type { NextRequest } from "next/server";

const MAX_TELEMETRY_BODY_BYTES = 64_000;

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const forbidden = requireRole(auth, "operator");
  if (forbidden) return forbidden;
  const invalidIdempotencyKey = validateIdempotencyKeyHeader(req);
  if (invalidIdempotencyKey) return invalidIdempotencyKey;

  const body = await readBoundedJsonBody(req, MAX_TELEMETRY_BODY_BYTES);
  if (body instanceof Response) return body;

  const parsed = AurelActionTelemetrySchema.safeParse(body.body);
  if (!parsed.success) {
    return err(parsed.error.issues.map((issue) => issue.message).join(", "), 422);
  }

  const telemetry = parsed.data as import("@/lib/actions/protocol").AurelActionTelemetry;
  try {
    recordLayerMetric({
      layer: "action_telemetry",
      decision: telemetry.outcome.status,
      risk_score: telemetryRiskScore(telemetry),
      duration_ms: telemetry.timings?.aurelPostflightLatencyMs ?? 0,
      workspace_id: auth.workspace_id,
      agent_id: telemetry.agent?.id,
    });
    return json({ accepted: true });
  } catch (error) {
    captureError(error, {
      layer: "action-telemetry",
      workspace_id: auth.workspace_id,
      action_id: telemetry.actionId,
    });
    return err("Telemetry ingestion failed", 500);
  }
}

export function telemetryRiskScore(telemetry: import("@/lib/actions/protocol").AurelActionTelemetry): number {
  const metadataRisk = telemetry.metadata?.riskScore;
  if (typeof metadataRisk === "number" && Number.isFinite(metadataRisk)) {
    return Math.max(0, Math.min(100, Math.round(metadataRisk)));
  }
  if (telemetry.outcome.status === "failure") return 50;
  if (telemetry.outcome.status === "blocked" || telemetry.outcome.status === "approval_denied") return 75;
  if (telemetry.outcome.status === "approval_requested") return 60;
  return 0;
}
