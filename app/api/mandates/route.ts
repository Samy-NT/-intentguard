import { type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateRequest, requireRole } from "@/lib/auth";
import {
  MANDATE_SIGNATURE_VERSION,
  MandatePayloadSchema,
  SignedMandateSchema,
  signMandate,
  verifyMandateSignature,
  type MandatePayload,
} from "@/lib/mandates";
import { err, json } from "@/lib/respond";
import { readBoundedJsonBody } from "@/lib/http/body";
import { buildAp2CompatibilityProfile } from "@/lib/ap2";

const MAX_MANDATE_BODY_BYTES = 32_000;

const CreateMandateSchema = z.object({
  mandate_id: z.string().min(1).max(256).optional(),
  expires_at: z.string().datetime(),
  mission_scope: z.string().min(1).max(1000),
  agent_id: z.string().max(256).optional(),
  max_amount: z.number().positive().optional(),
  currency: z.string().min(1).max(10).optional(),
  allowed_recipients: z.array(z.string().min(1).max(512)).max(256).optional(),
  allowed_merchants: z.array(z.string().min(1).max(512)).max(256).optional(),
  allowed_categories: z.array(z.string().min(1).max(128)).max(128).optional(),
  ap2: z
    .object({
      protocol_version: z.literal("v0.2").default("v0.2"),
      mode: z.enum(["human_present", "human_not_present"]),
      vct: z.enum(["mandate.checkout.open.1", "mandate.payment.open.1"]).optional(),
      checkout_hash: z.string().min(1).max(512).optional(),
      transaction_id: z.string().min(1).max(512).optional(),
    })
    .optional(),
  verifier: z
    .object({
      id: z.string().min(1).max(256),
      name: z.string().max(256).optional(),
    })
    .optional(),
});

const RevokeMandateSchema = z.object({
  mandate_id: z.string().min(1).max(256),
});

const VerifyMandateSchema = z.object({
  mandate: SignedMandateSchema,
});

function generateMandateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `mandate_${token}`;
}

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const { db, workspace_id } = auth;

  const url = new URL(req.url);
  const activeOnly = url.searchParams.get("active") !== "false";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

  let query = db
    .from("mandates")
    .select("id, mandate_id, payload, signature, signature_version, expires_at, revoked_at, created_at")
    .eq("workspace_id", workspace_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (activeOnly) query = query.is("revoked_at", null).gt("expires_at", new Date().toISOString());

  const { data, error } = await query;
  if (error) return err(error.message, 500);
  return json({ mandates: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const forbidden = requireRole(auth, "operator");
  if (forbidden) return forbidden;

  const parsedBody = await readBoundedJsonBody(req, MAX_MANDATE_BODY_BYTES);
  if (parsedBody instanceof Response) return parsedBody;

  const verifyRequest = VerifyMandateSchema.safeParse(parsedBody.body);
  if (verifyRequest.success) {
    const valid = verifyMandateSignature(verifyRequest.data.mandate);
    return json({
      valid,
      signature_version: verifyRequest.data.mandate.signature_version ?? MANDATE_SIGNATURE_VERSION,
      mandate_id: verifyRequest.data.mandate.payload.mandate_id,
      ap2_profile: buildAp2CompatibilityProfile(verifyRequest.data.mandate.payload),
    });
  }

  const parsed = CreateMandateSchema.safeParse(parsedBody.body);
  if (!parsed.success) return err(parsed.error.issues.map((issue) => issue.message).join(", "), 422);

  const payload: MandatePayload = MandatePayloadSchema.parse({
    ...parsed.data,
    mandate_id: parsed.data.mandate_id ?? generateMandateId(),
    workspace_id: auth.workspace_id,
    issued_at: new Date().toISOString(),
  });
  const signature = signMandate(payload);

  const { data, error } = await auth.db
    .from("mandates")
    .insert({
      workspace_id: auth.workspace_id,
      mandate_id: payload.mandate_id,
      payload,
      signature,
      signature_version: MANDATE_SIGNATURE_VERSION,
      expires_at: payload.expires_at,
    })
    .select("id, mandate_id, payload, signature, signature_version, expires_at, revoked_at, created_at")
    .single();

  if (error) return err(error.message, 500);
  return json(
    {
      mandate: data,
      signed_mandate: { payload, signature, signature_version: MANDATE_SIGNATURE_VERSION },
      ap2_profile: buildAp2CompatibilityProfile(payload),
    },
    201
  );
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const forbidden = requireRole(auth, "operator");
  if (forbidden) return forbidden;

  const parsedBody = await readBoundedJsonBody(req, MAX_MANDATE_BODY_BYTES);
  if (parsedBody instanceof Response) return parsedBody;

  const parsed = RevokeMandateSchema.safeParse(parsedBody.body);
  if (!parsed.success) return err(parsed.error.issues.map((issue) => issue.message).join(", "), 422);

  const { data, error } = await auth.db
    .from("mandates")
    .update({ revoked_at: new Date().toISOString() })
    .eq("workspace_id", auth.workspace_id)
    .eq("mandate_id", parsed.data.mandate_id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) return err(error.message, 500);
  if (!data) return err("Mandate not found", 404);
  return json({ success: true });
}
