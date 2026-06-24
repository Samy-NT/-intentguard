import { type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const DEMO_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

export async function GET() {
  const db = createServerClient();

  const { data, error } = await db
    .from("workspaces")
    .select("policy, webhook_url, webhook_secret, webhook_threshold")
    .eq("id", DEMO_WORKSPACE_ID)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Workspace not found" }, { status: 404 });

  return Response.json({
    settings: {
      ...(typeof data.policy === "object" && data.policy ? data.policy : {}),
      webhook_url: data.webhook_url ?? "",
      webhook_secret: data.webhook_secret ?? "",
      webhook_threshold:
        typeof data.webhook_threshold === "number" ? data.webhook_threshold : 70,
    },
  });
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = createServerClient();

  // Separate webhook columns from the JSONB policy blob
  const { webhook_url, webhook_secret, webhook_threshold, ...policy } = body;

  const { error } = await db
    .from("workspaces")
    .update({
      policy,
      webhook_url: typeof webhook_url === "string" && webhook_url ? webhook_url : null,
      webhook_secret:
        typeof webhook_secret === "string" && webhook_secret ? webhook_secret : null,
      webhook_threshold: typeof webhook_threshold === "number" ? webhook_threshold : 70,
    })
    .eq("id", DEMO_WORKSPACE_ID);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true });
}
