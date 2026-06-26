import { type NextRequest } from "next/server";
import { requireCronSecret } from "@/app/api/cron/_auth";
import { createServerClient } from "@/lib/supabase/server";
import { enqueueWebhookJob } from "@/lib/webhooks/queue";

interface WorkspaceRow {
  id: string;
  policy: Record<string, unknown> | null;
  webhook_url: string | null;
  webhook_secret: string | null;
  siem_url: string | null;
  siem_secret: string | null;
}

interface LogSummaryRow {
  decision: "allow" | "flag" | "block";
  risk_score: number;
  amount: number | string;
  currency: string;
}

function enabled(policy: Record<string, unknown> | null, key: string): boolean {
  return policy?.[key] === true;
}

function summarize(rows: LogSummaryRow[]) {
  const byDecision = { allow: 0, flag: 0, block: 0 };
  let maxRisk = 0;
  let totalAmountUsd = 0;

  for (const row of rows) {
    byDecision[row.decision]++;
    maxRisk = Math.max(maxRisk, row.risk_score);
    if (row.currency === "USD") totalAmountUsd += Number(row.amount) || 0;
  }

  return { total: rows.length, by_decision: byDecision, max_risk_score: maxRisk, total_amount_usd: totalAmountUsd };
}

export async function POST(req: NextRequest) {
  const auth = requireCronSecret(req);
  if (auth) return auth;

  const db = createServerClient();
  const { data, error } = await db
    .from("workspaces")
    .select("id, policy, webhook_url, webhook_secret, siem_url, siem_secret");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const since = new Date(Date.now() - 86_400_000).toISOString();
  let queued = 0;

  for (const ws of (data ?? []) as WorkspaceRow[]) {
    const wantsNightly = enabled(ws.policy, "nightly_export");
    const wantsSiem = typeof ws.siem_url === "string" && ws.siem_url.length > 0;
    if (!wantsNightly && !wantsSiem) continue;

    const { data: logs, error: logsError } = await db
      .from("verify_logs")
      .select("decision, risk_score, amount, currency")
      .eq("workspace_id", ws.id)
      .gte("created_at", since);
    if (logsError) return Response.json({ error: logsError.message }, { status: 500 });

    const payload = {
      event: "audit.nightly_export",
      workspace_id: ws.id,
      window: { since, until: new Date().toISOString() },
      summary: summarize((logs ?? []) as LogSummaryRow[]),
    };

    if (wantsNightly && ws.webhook_url) {
      const result = await enqueueWebhookJob(db, {
        workspace_id: ws.id,
        event: "audit.nightly_export",
        config: { url: ws.webhook_url, secret: ws.webhook_secret ?? undefined, threshold: 0 },
        payload,
      });
      if (!result.error) queued++;
    }

    if (wantsSiem && ws.siem_url) {
      const result = await enqueueWebhookJob(db, {
        workspace_id: ws.id,
        event: "siem.audit_export",
        config: { url: ws.siem_url, secret: ws.siem_secret ?? undefined, threshold: 0 },
        payload: { ...payload, event: "siem.audit_export" },
      });
      if (!result.error) queued++;
    }
  }

  return Response.json({ success: true, queued });
}
