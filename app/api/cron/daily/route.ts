import { type NextRequest } from "next/server";
import { requireCronSecret } from "@/app/api/cron/_auth";
import { runNightlyExportCron } from "@/app/api/cron/nightly-export/route";
import { runRetentionCron } from "@/app/api/cron/retention/route";
import { runWebhookCron } from "@/app/api/cron/webhooks/route";

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export async function POST(req: NextRequest) {
  const auth = requireCronSecret(req);
  if (auth) return auth;

  const [webhooks, nightlyExport, retention] = await Promise.all([
    runWebhookCron(),
    runNightlyExportCron(),
    runRetentionCron(),
  ]);

  const failed = [webhooks, nightlyExport, retention].filter((response) => !response.ok);
  return Response.json(
    {
      success: failed.length === 0,
      webhooks: await readJson(webhooks),
      nightly_export: await readJson(nightlyExport),
      retention: await readJson(retention),
    },
    { status: failed[0]?.status ?? 200 }
  );
}

export const GET = POST;
