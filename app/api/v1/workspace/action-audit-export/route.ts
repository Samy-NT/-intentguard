import { type NextRequest } from "next/server";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { err } from "@/lib/respond";

const ACTION_AUDIT_FIELDS = [
  "created_at",
  "action_id",
  "integration",
  "agent_id",
  "decision",
  "reason",
  "risk_score",
  "rule_ids",
  "policy_version",
  "trace_id",
  "payload_hash",
  "audit_signature",
  "audit_signature_version",
] as const;

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
  const parsedLimit = Number(url.searchParams.get("limit") ?? 500);
  const limit = Number.isFinite(parsedLimit) ? Math.min(1000, Math.max(1, Math.floor(parsedLimit))) : 500;

  const { data, error } = await auth.db
    .from("action_audit_logs")
    .select(ACTION_AUDIT_FIELDS.join(", "))
    .eq("workspace_id", auth.workspace_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return err("Action audit service unavailable", 503);

  const rows = data ?? [];
  if (format === "csv") {
    const csv = [
      ACTION_AUDIT_FIELDS.join(","),
      ...rows.map((row) => {
        const record = row as unknown as Record<string, unknown>;
        return ACTION_AUDIT_FIELDS.map((field) => csvEscape(record[field])).join(",");
      }),
    ].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=aurel-action-audit-export.csv",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return Response.json({ logs: rows });
}
