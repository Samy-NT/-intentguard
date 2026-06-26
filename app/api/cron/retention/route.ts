import { type NextRequest } from "next/server";
import { requireCronSecret } from "@/app/api/cron/_auth";
import { createServerClient } from "@/lib/supabase/server";

interface WorkspaceRow {
  id: string;
  policy: Record<string, unknown> | null;
}

function retentionDays(policy: Record<string, unknown> | null): number {
  const value = policy?.log_retention_days;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 90;
}

export async function POST(req: NextRequest) {
  const auth = requireCronSecret(req);
  if (auth) return auth;

  const db = createServerClient();
  const { data, error } = await db.from("workspaces").select("id, policy");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let deleted = 0;
  for (const ws of (data ?? []) as WorkspaceRow[]) {
    const cutoff = new Date(Date.now() - retentionDays(ws.policy) * 86_400_000).toISOString();
    const { count, error: deleteError } = await db
      .from("verify_logs")
      .delete({ count: "exact" })
      .eq("workspace_id", ws.id)
      .lt("created_at", cutoff);

    if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
    deleted += count ?? 0;
  }

  return Response.json({ success: true, deleted });
}
