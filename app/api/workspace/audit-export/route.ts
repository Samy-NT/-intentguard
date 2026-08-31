import { type NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const { db, workspace_id } = auth;

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") ?? 500)));

  const { data, error } = await db
    .from("verify_logs")
    .select("intent_id, agent_id, recipient, merchant_id, amount, currency, decision, triggered_rule, risk_score, review_status, review_note, reviewed_at, audit_signature, audit_signature_version, created_at")
    .eq("workspace_id", workspace_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (format === "csv") {
    const rows = data ?? [];
    const headers = [
      "created_at",
      "intent_id",
      "agent_id",
      "recipient",
      "merchant_id",
      "amount",
      "currency",
      "decision",
      "risk_score",
      "triggered_rule",
      "review_status",
      "review_note",
      "reviewed_at",
      "audit_signature",
      "audit_signature_version",
    ];
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((key) => csvEscape(row[key as keyof typeof row])).join(",")),
    ].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=intentguard-audit-export.csv",
      },
    });
  }

  return Response.json({ logs: data ?? [] });
}
