import { type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { readBoundedJsonBody } from "@/lib/http/body";

export const runtime = "nodejs";

const MemberRoleSchema = z.enum(["admin", "operator", "viewer"]);
const CreateMemberSchema = z.object({
  email: z.string().email().max(256).optional(),
  user_id: z.string().uuid().optional(),
  role: MemberRoleSchema.default("operator"),
}).refine((value) => Boolean(value.email || value.user_id), "email or user_id is required");

const RemoveMemberSchema = z.object({
  user_id: z.string().uuid(),
});

function callbackUrl(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.BILLING_APP_URL?.trim();
  const origin = configured || new URL(req.url).origin;
  return `${origin.replace(/\/$/, "")}/auth/callback`;
}

async function readJson(req: NextRequest): Promise<unknown | Response> {
  const parsed = await readBoundedJsonBody(req, 8_000);
  return parsed instanceof Response ? parsed : parsed.body;
}

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const forbidden = requireRole(auth, "admin");
  if (forbidden) return forbidden;

  const { data, error } = await auth.db
    .from("workspace_members")
    .select("id, workspace_id, user_id, role, is_active, created_at, updated_at")
    .eq("workspace_id", auth.workspace_id)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ members: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const forbidden = requireRole(auth, "admin");
  if (forbidden) return forbidden;

  const body = await readJson(req);
  if (body instanceof Response) return body;
  const parsed = CreateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join(", ") }, { status: 422 });
  }

  let userId = parsed.data.user_id;
  if (!userId && parsed.data.email) {
    const invite = await auth.db.auth.admin.inviteUserByEmail(parsed.data.email, {
      redirectTo: callbackUrl(req),
    });
    if (invite.error || !invite.data.user?.id) {
      return Response.json({ error: invite.error?.message ?? "Unable to invite Supabase user" }, { status: 502 });
    }
    userId = invite.data.user.id;
  }

  if (auth.supabase_user_id === userId && parsed.data.role !== "admin") {
    return Response.json({ error: "Cannot change the dashboard role used for this request" }, { status: 409 });
  }

  const { data, error } = await auth.db
    .from("workspace_members")
    .upsert({
      workspace_id: auth.workspace_id,
      user_id: userId!,
      role: parsed.data.role,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,user_id" })
    .select("id, workspace_id, user_id, role, is_active, created_at, updated_at")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ member: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const forbidden = requireRole(auth, "admin");
  if (forbidden) return forbidden;

  const body = await readJson(req);
  if (body instanceof Response) return body;
  const parsed = RemoveMemberSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join(", ") }, { status: 422 });
  }

  if (auth.supabase_user_id === parsed.data.user_id) {
    return Response.json({ error: "Cannot remove the dashboard user used for this request" }, { status: 409 });
  }

  const { data, error } = await auth.db
    .from("workspace_members")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("workspace_id", auth.workspace_id)
    .eq("user_id", parsed.data.user_id)
    .select("user_id")
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Workspace member not found" }, { status: 404 });
  return Response.json({ success: true });
}
