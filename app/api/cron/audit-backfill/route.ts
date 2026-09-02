import { type NextRequest } from "next/server";
import { requireCronSecret } from "@/app/api/cron/_auth";
import { backfillUnsignedAuditLogs } from "@/lib/audit-backfill";
import { createServerClient } from "@/lib/supabase/server";

export async function runAuditBackfillCron(limit = 500) {
  const db = createServerClient();
  const result = await backfillUnsignedAuditLogs(db, limit);
  return Response.json({ success: result.failed === 0, ...result }, { status: result.failed ? 500 : 200 });
}

export async function POST(req: NextRequest) {
  const auth = requireCronSecret(req);
  if (auth) return auth;

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 500);
  return runAuditBackfillCron(limit);
}

export const GET = POST;
