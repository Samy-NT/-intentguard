import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspacePolicy } from "@/lib/policies/evaluate";
import type { WebhookConfig } from "@/lib/webhooks/notify";

export interface WorkspaceConfig {
  policy: WorkspacePolicy | null;
  webhook: WebhookConfig | null;
  semantic_fail_mode: "allow" | "flag" | "block";
}

/**
 * Fetches operator policy + webhook config for a workspace in a single query.
 * Fails open on DB errors — never blocks legitimate payments due to a config
 * fetch failure.
 */
export async function getWorkspaceConfig(
  workspaceId: string,
  db: SupabaseClient
): Promise<WorkspaceConfig> {
  const { data, error } = await db
    .from("workspaces")
    .select("policy, webhook_url, webhook_secret, webhook_threshold, semantic_fail_mode")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) {
    console.error("[workspace] DB error fetching config:", error.message);
    return { policy: null, webhook: null, semantic_fail_mode: "flag" };
  }

  if (!data) {
    return { policy: null, webhook: null, semantic_fail_mode: "flag" };
  }

  const policy =
    data.policy && typeof data.policy === "object"
      ? (data.policy as WorkspacePolicy)
      : null;

  const webhook: WebhookConfig | null =
    typeof data.webhook_url === "string" && data.webhook_url
      ? {
          url: data.webhook_url,
          secret: typeof data.webhook_secret === "string" ? data.webhook_secret : undefined,
          threshold:
            typeof data.webhook_threshold === "number" ? data.webhook_threshold : 70,
          escalate_on_block: policy?.escalate_on_block !== false,
          escalate_on_flag: policy?.escalate_on_flag !== false,
          escalate_on_risk_score: policy?.escalate_on_risk_score !== false,
          escalate_above_amount:
            typeof policy?.escalate_above_amount === "number" ? policy.escalate_above_amount : 0,
        }
      : null;

  const semantic_fail_mode =
    data.semantic_fail_mode === "allow" || data.semantic_fail_mode === "block" || data.semantic_fail_mode === "flag"
      ? data.semantic_fail_mode
      : "flag";

  return { policy, webhook, semantic_fail_mode };
}
