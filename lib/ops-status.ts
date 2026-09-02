import type { SupabaseClient } from "@supabase/supabase-js";

type JobStatus = "pending" | "delivered" | "failed" | "blocked";
type DeliveryStatus = "blocked" | "delivered" | "failed";
type OpsLevel = "ok" | "warn" | "fail";

type AlertSeverity = "none" | "warning" | "critical";

interface WebhookJobStatusRow {
  status: JobStatus;
  next_attempt_at: string | null;
  updated_at: string | null;
  created_at: string;
}

interface WebhookDeliveryStatusRow {
  status: DeliveryStatus;
  created_at: string;
}

interface VerifyLogStatusRow {
  decision: "allow" | "flag" | "block";
  review_status: "not_required" | "pending" | "approved" | "rejected";
  created_at: string;
}

interface WorkspaceOpsRow {
  policy: Record<string, unknown> | null;
}

export interface WorkspaceOpsStatus {
  status: OpsLevel;
  generated_at: string;
  workspace_id: string;
  checks: Array<{
    name: string;
    status: OpsLevel;
    detail: string;
  }>;
  webhooks: {
    configured: boolean;
    threshold: number | null;
    pending: number;
    due: number;
    failed: number;
    blocked: number;
    delivered: number;
    oldest_pending_age_seconds: number | null;
    latest_delivery_at: string | null;
    latest_delivery_status: DeliveryStatus | null;
  };
  siem: {
    configured: boolean;
    nightly_export_enabled: boolean;
  };
  verification: {
    last_24h: number;
    flagged_pending: number;
    blocked_last_24h: number;
  };
  sla: {
    window_hours: number;
    target_success_rate: number;
    webhook_attempts: number;
    webhook_failures: number;
    webhook_success_rate: number | null;
    error_budget_burn_percent: number | null;
    max_pending_age_seconds: number | null;
    backlog_due: number;
  };
  alerts: {
    severity: AlertSeverity;
    routing_configured: boolean;
    channels: string[];
    reasons: string[];
    recommended_actions: string[];
  };
}

const SLA_WINDOW_HOURS = 24;
const SLA_TARGET_SUCCESS_RATE = 0.99;
const BACKLOG_WARN_DUE = 25;
const BACKLOG_FAIL_DUE = 100;
const PENDING_WARN_AGE_SECONDS = 15 * 60;
const PENDING_FAIL_AGE_SECONDS = 60 * 60;

function asPolicy(value: Record<string, unknown> | null): Record<string, unknown> {
  return value ?? {};
}

function numberSetting(policy: Record<string, unknown>, key: string): number | null {
  const value = policy[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanSetting(policy: Record<string, unknown>, key: string): boolean {
  return policy[key] === true;
}

function stringSetting(policy: Record<string, unknown>, key: string): string | null {
  const value = policy[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function ageSeconds(now: Date, iso: string): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
}

function worstStatus(checks: WorkspaceOpsStatus["checks"]): OpsLevel {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "ok";
}

function alertSeverity(checks: WorkspaceOpsStatus["checks"]): AlertSeverity {
  const status = worstStatus(checks);
  if (status === "fail") return "critical";
  if (status === "warn") return "warning";
  return "none";
}

function compact<T>(values: Array<T | null | undefined | false>): T[] {
  return values.filter(Boolean) as T[];
}

export async function buildWorkspaceOpsStatus(
  db: SupabaseClient,
  workspaceId: string,
  now = new Date()
): Promise<WorkspaceOpsStatus> {
  const since24h = new Date(now.getTime() - 86_400_000).toISOString();
  const nowIso = now.toISOString();

  const [workspaceResult, jobsResult, deliveriesResult, logsResult] = await Promise.all([
    db.from("workspaces").select("policy").eq("id", workspaceId).maybeSingle<WorkspaceOpsRow>(),
    db
      .from("webhook_jobs")
      .select("status, next_attempt_at, updated_at, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(250),
    db
      .from("webhook_deliveries")
      .select("status, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(25),
    db
      .from("verify_logs")
      .select("decision, review_status, created_at")
      .eq("workspace_id", workspaceId)
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (workspaceResult.error) throw new Error(`Failed to load workspace ops settings: ${workspaceResult.error.message}`);
  if (jobsResult.error) throw new Error(`Failed to load webhook jobs: ${jobsResult.error.message}`);
  if (deliveriesResult.error) throw new Error(`Failed to load webhook deliveries: ${deliveriesResult.error.message}`);
  if (logsResult.error) throw new Error(`Failed to load verification logs: ${logsResult.error.message}`);

  const policy = asPolicy(workspaceResult.data?.policy ?? null);
  const jobs = (jobsResult.data ?? []) as WebhookJobStatusRow[];
  const deliveries = (deliveriesResult.data ?? []) as WebhookDeliveryStatusRow[];
  const logs = (logsResult.data ?? []) as VerifyLogStatusRow[];
  const pendingJobs = jobs.filter((job) => job.status === "pending");
  const dueJobs = pendingJobs.filter((job) => !job.next_attempt_at || job.next_attempt_at <= nowIso);
  const failedJobs = jobs.filter((job) => job.status === "failed");
  const blockedJobs = jobs.filter((job) => job.status === "blocked");
  const deliveredJobs = jobs.filter((job) => job.status === "delivered");
  const oldestPending = pendingJobs.reduce<string | null>((oldest, job) => {
    const created = job.created_at;
    if (!oldest || created < oldest) return created;
    return oldest;
  }, null);
  const latestDelivery = deliveries[0] ?? null;
  const webhookConfigured = stringSetting(policy, "webhook_url") !== null;
  const siemConfigured = stringSetting(policy, "siem_url") !== null;
  const nightlyExportEnabled = booleanSetting(policy, "nightly_export");
  const flaggedPending = logs.filter((log) => log.review_status === "pending").length;
  const blockedLast24h = logs.filter((log) => log.decision === "block").length;
  const webhookAttempts = deliveries.length;
  const webhookFailures = deliveries.filter((delivery) => delivery.status === "failed" || delivery.status === "blocked").length;
  const webhookSuccessRate = webhookAttempts > 0 ? (webhookAttempts - webhookFailures) / webhookAttempts : null;
  const errorBudget = 1 - SLA_TARGET_SUCCESS_RATE;
  const observedErrorRate = webhookSuccessRate === null ? null : 1 - webhookSuccessRate;
  const errorBudgetBurnPercent = observedErrorRate === null ? null : Math.round((observedErrorRate / errorBudget) * 100);
  const maxPendingAgeSeconds = webhooksOldestAge(now, pendingJobs);

  const webhooks = {
    configured: webhookConfigured,
    threshold: numberSetting(policy, "webhook_threshold"),
    pending: pendingJobs.length,
    due: dueJobs.length,
    failed: failedJobs.length,
    blocked: blockedJobs.length,
    delivered: deliveredJobs.length,
    oldest_pending_age_seconds: oldestPending ? ageSeconds(now, oldestPending) : null,
    latest_delivery_at: latestDelivery?.created_at ?? null,
    latest_delivery_status: latestDelivery?.status ?? null,
  };
  const siem = {
    configured: siemConfigured,
    nightly_export_enabled: nightlyExportEnabled,
  };
  const verification = {
    last_24h: logs.length,
    flagged_pending: flaggedPending,
    blocked_last_24h: blockedLast24h,
  };
  const sla = {
    window_hours: SLA_WINDOW_HOURS,
    target_success_rate: SLA_TARGET_SUCCESS_RATE,
    webhook_attempts: webhookAttempts,
    webhook_failures: webhookFailures,
    webhook_success_rate: webhookSuccessRate,
    error_budget_burn_percent: errorBudgetBurnPercent,
    max_pending_age_seconds: maxPendingAgeSeconds,
    backlog_due: dueJobs.length,
  };

  const checks: WorkspaceOpsStatus["checks"] = [
    webhookConfigured
      ? { name: "webhook.config", status: "ok", detail: "Webhook escalation URL is configured" }
      : { name: "webhook.config", status: "warn", detail: "Webhook escalation URL is not configured" },
    failedJobs.length > 0 || blockedJobs.length > 0
      ? { name: "webhook.failures", status: "fail", detail: `${failedJobs.length} failed and ${blockedJobs.length} blocked webhook jobs` }
      : { name: "webhook.failures", status: "ok", detail: "No failed or blocked webhook jobs in the sampled queue" },
    dueJobs.length > BACKLOG_FAIL_DUE
      ? { name: "webhook.backlog", status: "fail", detail: `${dueJobs.length} webhook jobs are due for retry` }
      : dueJobs.length > BACKLOG_WARN_DUE
      ? { name: "webhook.backlog", status: "warn", detail: `${dueJobs.length} webhook jobs are due for retry` }
      : { name: "webhook.backlog", status: "ok", detail: `${dueJobs.length} webhook jobs are due for retry` },
    maxPendingAgeSeconds !== null && maxPendingAgeSeconds >= PENDING_FAIL_AGE_SECONDS
      ? { name: "webhook.latency", status: "fail", detail: `Oldest pending webhook job is ${maxPendingAgeSeconds}s old` }
      : maxPendingAgeSeconds !== null && maxPendingAgeSeconds >= PENDING_WARN_AGE_SECONDS
      ? { name: "webhook.latency", status: "warn", detail: `Oldest pending webhook job is ${maxPendingAgeSeconds}s old` }
      : { name: "webhook.latency", status: "ok", detail: "Webhook queue latency is inside the pilot SLO" },
    errorBudgetBurnPercent !== null && errorBudgetBurnPercent >= 100
      ? { name: "sla.error_budget", status: "fail", detail: `Webhook delivery error budget is ${errorBudgetBurnPercent}% consumed` }
      : errorBudgetBurnPercent !== null && errorBudgetBurnPercent >= 50
      ? { name: "sla.error_budget", status: "warn", detail: `Webhook delivery error budget is ${errorBudgetBurnPercent}% consumed` }
      : { name: "sla.error_budget", status: "ok", detail: errorBudgetBurnPercent === null ? "No webhook deliveries sampled in the last status window" : `Webhook delivery error budget is ${errorBudgetBurnPercent}% consumed` },
    flaggedPending > 0
      ? { name: "review.queue", status: "warn", detail: `${flaggedPending} flagged verification logs need review` }
      : { name: "review.queue", status: "ok", detail: "No flagged verification logs need review in the last 24h sample" },
    nightlyExportEnabled && !siemConfigured
      ? { name: "siem.config", status: "warn", detail: "Nightly export is enabled without a SIEM URL" }
      : { name: "siem.config", status: "ok", detail: siemConfigured ? "SIEM URL is configured" : "SIEM export is not enabled" },
  ];
  const failingChecks = checks.filter((check) => check.status === "fail");
  const warningChecks = checks.filter((check) => check.status === "warn");
  const routedChannels = compact([
    webhookConfigured && "webhook",
    siemConfigured && "siem",
    nightlyExportEnabled && "nightly_export",
  ]);
  const alerts = {
    severity: alertSeverity(checks),
    routing_configured: routedChannels.length > 0,
    channels: routedChannels,
    reasons: [...failingChecks, ...warningChecks].map((check) => check.detail),
    recommended_actions: recommendedActions(checks),
  };

  return {
    status: worstStatus(checks),
    generated_at: nowIso,
    workspace_id: workspaceId,
    checks,
    webhooks,
    siem,
    verification,
    sla,
    alerts,
  };
}

function webhooksOldestAge(now: Date, jobs: WebhookJobStatusRow[]): number | null {
  const ages = jobs.map((job) => ageSeconds(now, job.created_at));
  return ages.length > 0 ? Math.max(...ages) : null;
}

function recommendedActions(checks: WorkspaceOpsStatus["checks"]): string[] {
  const names = new Set(checks.filter((check) => check.status !== "ok").map((check) => check.name));
  const actions = compact([
    names.has("webhook.config") && "Configure a webhook escalation URL in Integrations.",
    names.has("webhook.failures") && "Inspect terminal webhook jobs, fix the downstream endpoint or secret, then retry failed jobs.",
    names.has("webhook.backlog") && "Run the webhook retry cron and confirm the downstream service is accepting traffic.",
    names.has("webhook.latency") && "Check scheduler health and queue throughput before opening more pilot traffic.",
    names.has("sla.error_budget") && "Treat the workspace as degraded until webhook delivery success returns inside the SLO.",
    names.has("review.queue") && "Clear pending review decisions or tune the active pilot policy template.",
    names.has("siem.config") && "Either configure a SIEM URL or disable nightly export for this workspace.",
  ]);

  return actions.length > 0 ? actions : ["No operator action is required."];
}
