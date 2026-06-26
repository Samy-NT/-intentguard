import { type NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const { db, workspace_id } = auth;

  const { data, error } = await db
    .from("webhook_deliveries")
    .select("id, intent_id, event, status, http_status, error, created_at")
    .eq("workspace_id", workspace_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ deliveries: data ?? [] });
}
