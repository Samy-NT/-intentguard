import { authenticateRequest, requireRole } from "@/lib/auth";
import { evaluateAurelAction } from "@/lib/actions/evaluate";
import { AurelActionRequestSchema, type AurelActionRequest } from "@/lib/actions/protocol";
import { redactForTelemetry } from "@/lib/actions/redaction";
import { err, json } from "@/lib/respond";
import { captureError, recordLayerMetric } from "@/lib/monitoring";
import { getWorkspaceConfig } from "@/lib/workspaces";
import { readBoundedJsonBody } from "@/lib/http/body";
import { validateIdempotencyKeyHeader } from "@/lib/http/idempotency";
import type { NextRequest } from "next/server";

const MAX_ACTION_BODY_BYTES = 64_000;

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const forbidden = requireRole(auth, "operator");
  if (forbidden) return forbidden;
  const invalidIdempotencyKey = validateIdempotencyKeyHeader(req);
  if (invalidIdempotencyKey) return invalidIdempotencyKey;

  const started = performance.now();
  const parsedBody = await readBoundedJsonBody(req, MAX_ACTION_BODY_BYTES);
  if (parsedBody instanceof Response) return parsedBody;

  const parsed = AurelActionRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return err(parsed.error.issues.map((issue) => issue.message).join(", "), 422);
  }

  const action = parsed.data as AurelActionRequest;

  try {
    const wsConfig = await getWorkspaceConfig(auth.workspace_id, auth.db);
    const { decision } = evaluateAurelAction(action, wsConfig.policy);

    recordLayerMetric({
      layer: "action_evaluation",
      decision: decision.decision,
      risk_score: decision.riskScore ?? 0,
      duration_ms: Math.round(performance.now() - started),
      workspace_id: auth.workspace_id,
      agent_id: action.agent.id,
    });

    return json(decision);
  } catch (error) {
    captureError(error, {
      layer: "actions",
      workspace_id: auth.workspace_id,
      action: redactForTelemetry(action, { maxBytes: 4096 }),
    });
    return err("Action evaluation failed", 500);
  }
}
