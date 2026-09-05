import { type NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { err, json } from "@/lib/respond";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const url = new URL(req.url);
  const actionId = url.searchParams.get("action_id");
  const parsedLimit = Number(url.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(parsedLimit) ? Math.min(500, Math.max(1, Math.floor(parsedLimit))) : 100;
  let query = auth.db.from("action_telemetry_events")
    .select("id, workspace_id, action_id, integration, trace_id, agent_id, outcome_status, duration_ms, error_category, timings, metadata, event_hash, created_at")
    .eq("workspace_id", auth.workspace_id)
    .order("created_at", { ascending: false }).limit(limit);
  if (actionId) query = query.eq("action_id", actionId);
  const { data, error } = await query;
  if (error) return err("Action telemetry service unavailable", 503);
  return json({ events: data ?? [] });
}
