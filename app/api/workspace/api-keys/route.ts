import { type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateRequest, hashApiKey, requireRole } from "@/lib/auth";

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(80),
  role: z.enum(["admin", "operator", "viewer"]).optional().default("operator"),
});

const RevokeApiKeySchema = z.object({
  id: z.string().uuid(),
});

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `ig_live_${token}`;
}

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const { db, workspace_id } = auth;

  const { data, error } = await db
    .from("api_keys")
    .select("id, name, role, is_active, last_used_at, revoked_at, created_at")
    .eq("workspace_id", workspace_id)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ api_keys: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const { db, workspace_id } = auth;
  const forbidden = requireRole(auth, "admin");
  if (forbidden) return forbidden;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateApiKeySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 422 });
  }

  const raw_key = generateApiKey();
  const key_hash = await hashApiKey(raw_key);

  const { data, error } = await db
    .from("api_keys")
    .insert({
      workspace_id,
      name: parsed.data.name,
      role: parsed.data.role,
      key_hash,
      is_active: true,
    })
    .select("id, name, role, is_active, last_used_at, revoked_at, created_at")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json(
    {
      api_key: data,
      raw_key,
    },
    { status: 201 }
  );
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const { db, workspace_id } = auth;
  const forbidden = requireRole(auth, "admin");
  if (forbidden) return forbidden;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RevokeApiKeySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 422 });
  }

  const { error } = await db
    .from("api_keys")
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq("workspace_id", workspace_id)
    .eq("id", parsed.data.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
