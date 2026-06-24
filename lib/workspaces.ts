import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspacePolicy } from "@/lib/policies/evaluate";
import type { WebhookConfig } from "@/lib/webhooks/notify";

export interface WorkspaceConfig {
  policy: WorkspacePolicy | null;
  webhook: WebhookConfig | null;
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
    .select("policy, webhook_url, webhook_secret, webhook_threshold")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) {
    // Most likely cause: migration 003 not yet run (column webhook_threshold missing)
    console.error("[workspace] DB error fetching config — is migration 003 applied?", error.message);
    return { policy: null, webhook: null };
  }

  if (!data) {
    console.warn("[workspace] No row found for workspace_id:", workspaceId);
    return { policy: null, webhook: null };
  }

  console.log("[workspace] raw row:", {
    workspace_id: workspaceId,
    has_policy: !!data.policy,
    webhook_url: data.webhook_url ?? null,
    webhook_threshold: data.webhook_threshold ?? null,
  });

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
        }
      : null;

  console.log("[workspace] config resolved:", {
    has_policy: !!policy,
    webhook_url: webhook?.url ?? null,
    webhook_threshold: webhook?.threshold ?? null,
  });

  return { policy, webhook };
}
