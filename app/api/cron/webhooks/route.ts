import { type NextRequest } from "next/server";
import { requireCronSecret } from "@/app/api/cron/_auth";
import { createServerClient } from "@/lib/supabase/server";
import { processWebhookQueue } from "@/lib/webhooks/queue";

export async function runWebhookCron() {
  const db = createServerClient();
  const result = await processWebhookQueue(db);
  return Response.json({ success: true, ...result });
}

export async function POST(req: NextRequest) {
  const auth = requireCronSecret(req);
  if (auth) return auth;
  return runWebhookCron();
}

export const GET = POST;
