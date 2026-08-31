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
  locked_at: string | null;
  locked_by: string | null;
}

function retryDelaySeconds(attempts: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
}

function generateWorkerId(): string {
  return `worker-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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
    intent_id: job.intent_id ?? "system-job",
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
  const workerId = generateWorkerId();
  const lockedAt = new Date().toISOString();

  // Select and lock pending jobs
  const { data, error } = await db
    .from("webhook_jobs")
    .select("id, workspace_id, intent_id, event, target_url, secret, payload, attempts, max_attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .or(`locked_at.is.null,locked_at.lt.${new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to load webhook jobs: ${error.message}`);

  // Attempt to lock all selected jobs
  const jobIds = (data ?? []).map((j) => j.id);
  if (jobIds.length === 0) {
    return { processed: 0, delivered: 0, failed: 0, blocked: 0 };
  }

  const { error: lockError } = await db
    .from("webhook_jobs")
    .update({ locked_at: lockedAt, locked_by: workerId })
    .in("id", jobIds)
    .eq("status", "pending")
    .or(`locked_at.is.null,locked_at.lt.${new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString()}`);

  if (lockError) {
    console.error("[webhook-queue] Failed to lock jobs:", lockError.message);
    return { processed: 0, delivered: 0, failed: 0, blocked: 0 };
  }

  // Re-fetch only the jobs we successfully locked
  const { data: lockedJobs, error: refetchError } = await db
    .from("webhook_jobs")
    .select("id, workspace_id, intent_id, event, target_url, secret, payload, attempts, max_attempts")
    .in("id", jobIds)
    .eq("locked_by", workerId);

  if (refetchError) throw new Error(`Failed to refetch locked jobs: ${refetchError.message}`);

  let delivered = 0;
  let failed = 0;
  let blocked = 0;

  for (const job of (lockedJobs ?? []) as WebhookJobRow[]) {
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
          locked_at: null,
          locked_by: null,
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
        locked_at: null,
        locked_by: null,
      })
      .eq("id", job.id);
  }

  return { processed: lockedJobs?.length ?? 0, delivered, failed, blocked };
}
