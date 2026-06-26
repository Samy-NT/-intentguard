import { type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateRequest, requireRole } from "@/lib/auth";

const RetryJobSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const { db, workspace_id } = auth;

  const { data, error } = await db
    .from("webhook_jobs")
    .select("id, intent_id, event, status, attempts, max_attempts, next_attempt_at, last_error, http_status, delivered_at, created_at, updated_at")
    .eq("workspace_id", workspace_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ jobs: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const forbidden = requireRole(auth, "operator");
  if (forbidden) return forbidden;
  const { db, workspace_id } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RetryJobSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 422 });
  }

  const { data, error } = await db
    .from("webhook_jobs")
    .update({
      status: "pending",
      next_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspace_id)
    .eq("id", parsed.data.id)
    .select("id, status, next_attempt_at")
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Webhook job not found" }, { status: 404 });
  return Response.json({ job: data });
}
