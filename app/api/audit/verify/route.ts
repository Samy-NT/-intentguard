import { z } from "zod";
import {
  AUDIT_SIGNATURE_VERSION,
  verifyAuditDecisionSignature,
  type AuditDecisionRecord,
} from "@/lib/audit";

const AuditRecordSchema = z.object({
  workspace_id: z.string().min(1),
  intent_id: z.string().min(1),
  agent_id: z.string().min(1),
  recipient: z.string().min(1),
  merchant_id: z.string().nullable(),
  amount: z.coerce.number(),
  currency: z.string().min(1),
  decision: z.string().min(1),
  triggered_rule: z.string().nullable(),
  risk_score: z.coerce.number().int().min(0).max(100),
  evaluated_at: z.string().min(1),
});

const VerifyAuditSchema = z.object({
  record: AuditRecordSchema,
  audit_signature: z.string().regex(/^[a-f0-9]{64}$/i),
  audit_signature_version: z.literal(AUDIT_SIGNATURE_VERSION).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = VerifyAuditSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 422 });
  }

  const valid = verifyAuditDecisionSignature(
    parsed.data.record as AuditDecisionRecord,
    parsed.data.audit_signature.toLowerCase()
  );

  return Response.json({
    valid,
    audit_signature_version: AUDIT_SIGNATURE_VERSION,
  });
}
