import type { SupabaseClient } from "@supabase/supabase-js";
import { fireWebhook, type EscalationPayload, type WebhookConfig, type WebhookPayload } from "@/lib/webhooks/notify";

type WebhookEvent = "payment.escalation" | "audit.nightly_export" | "siem.audit_export";

interface QueueJobInput {
  workspace_id: string;
  intent_id?: string | null;
  event: WebhookEvent;
  payload: Record<string, unknown> | EscalationPayload;
  config: WebhookConfig;
}

interface WebhookJobRow {
  id: string;
  workspace_id: string;
  intent_id: string | null;
  event: WebhookEvent;
  target_url: string;
  secret: string | null;
  payload: WebhookPayload;
  attempts: number;
  max_attempts: number;
}

function retryDelaySeconds(attempts: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
}

export async function enqueueWebhookJob(
  db: SupabaseClient,
  input: QueueJobInput
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await db
    .from("webhook_jobs")
    .insert({
      workspace_id: input.workspace_id,
      intent_id: input.intent_id ?? null,
      event: input.event,
      target_url: input.config.url,
      secret: input.config.secret ?? null,
      payload: input.payload,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) return { id: null, error: error.message };
  return { id: data?.id ?? null, error: null };
}

async function markDeliveryAudit(
  db: SupabaseClient,
  job: WebhookJobRow,
  result: Awaited<ReturnType<typeof fireWebhook>>
) {
  const { error } = await db.from("webhook_deliveries").insert({
    workspace_id: job.workspace_id,
    intent_id: job.intent_id ?? job.id,
    event: job.event,
    status: result.status,
    http_status: result.http_status ?? null,
    error: result.error ?? null,
  });
  if (error) console.error("[webhook-queue] delivery audit write failed:", error.message);
}

export async function processWebhookQueue(
  db: SupabaseClient,
  limit = 25
): Promise<{ processed: number; delivered: number; failed: number; blocked: number }> {
  const { data, error } = await db
    .from("webhook_jobs")
    .select("id, workspace_id, intent_id, event, target_url, secret, payload, attempts, max_attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to load webhook jobs: ${error.message}`);

  let delivered = 0;
  let failed = 0;
  let blocked = 0;

  for (const job of (data ?? []) as WebhookJobRow[]) {
    const result = await fireWebhook(job.payload, {
      url: job.target_url,
      secret: job.secret ?? undefined,
      threshold: 0,
    });

    await markDeliveryAudit(db, job, result);

    if (result.status === "delivered") {
      delivered++;
      await db
        .from("webhook_jobs")
        .update({
          status: "delivered",
          attempts: job.attempts + 1,
          http_status: result.http_status ?? null,
          last_error: null,
          delivered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      continue;
    }

    if (result.status === "blocked") blocked++;
    else failed++;

    const attempts = job.attempts + 1;
    const terminal = result.status === "blocked" || attempts >= job.max_attempts;
    const nextAttemptAt = new Date(Date.now() + retryDelaySeconds(attempts) * 1000).toISOString();

    await db
      .from("webhook_jobs")
      .update({
        status: terminal ? result.status : "pending",
        attempts,
        http_status: result.http_status ?? null,
        last_error: result.error ?? (result.http_status ? `HTTP ${result.http_status}` : result.status),
        next_attempt_at: terminal ? new Date().toISOString() : nextAttemptAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  }

  return { processed: data?.length ?? 0, delivered, failed, blocked };
}
