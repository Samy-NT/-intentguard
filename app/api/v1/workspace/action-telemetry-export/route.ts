import { type NextRequest } from "next/server";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { err } from "@/lib/respond";

const FIELDS = ["created_at", "action_id", "integration", "trace_id", "agent_id", "outcome_status", "duration_ms", "error_category", "timings", "metadata", "event_hash"] as const;
function csvEscape(value: unknown): string {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const forbidden = requireRole(auth, "operator");
  if (forbidden) return forbidden;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  if (format !== "json" && format !== "csv") return err("format must be json or csv", 422);
  const value = Number(url.searchParams.get("limit") ?? 500);
  const limit = Number.isFinite(value) ? Math.min(1000, Math.max(1, Math.floor(value))) : 500;
  const { data, error } = await auth.db.from("action_telemetry_events").select(FIELDS.join(", ")).eq("workspace_id", auth.workspace_id).order("created_at", { ascending: false }).limit(limit);
  if (error) return err("Action telemetry service unavailable", 503);
  const rows = data ?? [];
  if (format === "csv") {
    const csv = [FIELDS.join(","), ...rows.map((row) => FIELDS.map((field) => csvEscape((row as unknown as Record<string, unknown>)[field])).join(","))].join("\n");
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=aurel-action-telemetry-export.csv", "X-Content-Type-Options": "nosniff" } });
  }
  return Response.json({ events: rows });
}
