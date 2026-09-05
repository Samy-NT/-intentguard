import { authenticateRequest, requireRole } from "@/lib/auth";
import { evaluateAurelAction } from "@/lib/actions/evaluate";
import { AurelActionRequestSchema, type AurelActionRequest } from "@/lib/actions/protocol";
import { redactForTelemetry } from "@/lib/actions/redaction";
import { err, json } from "@/lib/respond";
import { captureError, recordLayerMetric } from "@/lib/monitoring";
import { getWorkspaceConfig } from "@/lib/workspaces";
import { readBoundedJsonBody } from "@/lib/http/body";
import { validateIdempotencyKeyHeader } from "@/lib/http/idempotency";
import { actionAuditResponse, buildActionAudit, findActionAudit, hashActionPayload, persistActionAudit } from "@/lib/action-audit";
import { checkWorkspaceRateLimit } from "@/lib/ratelimit";
import type { NextRequest } from "next/server";

const MAX_ACTION_BODY_BYTES = 64_000;

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const forbidden = requireRole(auth, "operator");
  if (forbidden) return forbidden;
  const rateLimit = await checkWorkspaceRateLimit(auth.workspace_id);
  if (!rateLimit.allowed) return err("Workspace action rate limit exceeded", 429);
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
    const existingAudit = await findActionAudit(auth.db, auth.workspace_id, action.action.id);
    if (existingAudit.error) return err("Action audit service unavailable", 503);
    if (existingAudit.data) {
      if (existingAudit.data.payload_hash !== hashActionPayload(action)) {
        return err("Action id was already used with a different payload", 409);
      }
      return json(actionAuditResponse(existingAudit.data));
    }

    const { decision } = evaluateAurelAction(action, wsConfig.policy);
    const audit = existingAudit.available ? buildActionAudit(auth.workspace_id, action, decision) : null;

    if (audit) {
      const persisted = await persistActionAudit(auth.db, audit);
      if (persisted.error) {
        // A unique race means another request won the idempotency insert. Return its record.
        const racedAudit = await findActionAudit(auth.db, auth.workspace_id, action.action.id);
        if (racedAudit.data && racedAudit.data.payload_hash === audit.record.payload_hash) {
          return json(actionAuditResponse(racedAudit.data));
        }
        return err("Failed to persist action audit record", 503);
      }
    }

    recordLayerMetric({
      layer: "action_evaluation",
      decision: decision.decision,
      risk_score: decision.riskScore ?? 0,
      duration_ms: Math.round(performance.now() - started),
      workspace_id: auth.workspace_id,
      agent_id: action.agent.id,
    });

    return json(
      audit
        ? {
            ...decision,
            auditSignature: audit.signature,
            auditSignatureVersion: audit.signature_version,
            evaluatedAt: audit.record.evaluated_at,
          }
        : decision
    );
  } catch (error) {
    captureError(error, {
      layer: "actions",
      workspace_id: auth.workspace_id,
      action: redactForTelemetry(action, { maxBytes: 4096 }),
    });
    return err("Action evaluation failed", 500);
  }
}
