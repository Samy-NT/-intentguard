import { z } from "zod";
import {
  ACTION_AUDIT_SIGNATURE_VERSION,
  verifyActionAuditDecisionSignature,
  type ActionAuditDecisionRecord,
} from "@/lib/audit";

const ActionAuditRecordSchema = z.object({
  workspace_id: z.string().min(1),
  action_id: z.string().min(1),
  integration: z.string().min(1),
  agent_id: z.string().nullable(),
  decision: z.enum(["allow", "block", "require_approval", "rewrite", "quarantine"]),
  reason: z.string().nullable(),
  risk_score: z.coerce.number().int().min(0).max(100),
  rule_ids: z.array(z.string()).max(128),
  policy_version: z.string().nullable(),
  trace_id: z.string().nullable(),
  payload_hash: z.string().regex(/^[a-f0-9]{64}$/i),
  evaluated_at: z.string().datetime(),
});

const VerifyActionAuditSchema = z.object({
  record: ActionAuditRecordSchema,
  audit_signature: z.string().regex(/^[a-f0-9]{64}$/i),
  audit_signature_version: z.literal(ACTION_AUDIT_SIGNATURE_VERSION).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = VerifyActionAuditSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join(", ") }, { status: 422 });
  }

  const valid = verifyActionAuditDecisionSignature(
    parsed.data.record as ActionAuditDecisionRecord,
    parsed.data.audit_signature.toLowerCase()
  );

  return Response.json({ valid, audit_signature_version: ACTION_AUDIT_SIGNATURE_VERSION });
}
