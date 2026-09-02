import { createServerClient } from "@/lib/supabase/server";
import { buildReadinessReport } from "@/lib/readiness";
import { err, json } from "@/lib/respond";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const secret = process.env.CRON_SECRET;
    if (!secret) return err("Readiness is not configured", 503);
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return err("Unauthorized", 401);
  }

  const report = await buildReadinessReport(createServerClient);
  const status = report.status === "fail" ? 503 : 200;
  return json(report, status);
}
