import { type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { normalizeWorkspacePolicy, syncManagedRules } from "@/lib/settings-policy";
import { validateWebhookUrl } from "@/lib/webhooks/validate";

const MASKED_SECRET = "********";
const MAX_SETTINGS_BODY_BYTES = 64_000;
const PROVIDER_MANAGED_POLICY_KEYS = [
  "workspace_status",
  "billing_plan",
  "monthly_verification_limit",
  "limit_period_start",
] as const;

function optionalStringOrNull(body: Record<string, unknown>, key: string): boolean {
  return !(key in body) || typeof body[key] === "string" || body[key] === null;
}

function optionalSemanticFailMode(body: Record<string, unknown>): boolean {
  const value = body.semantic_fail_mode;
  return !("semantic_fail_mode" in body) || value === "allow" || value === "flag" || value === "block";
}

const SettingsPatchSchema = z
  .record(z.unknown())
  .refine((body) => optionalStringOrNull(body, "webhook_url"), {
    message: "webhook_url must be a string or null",
  })
  .refine((body) => optionalStringOrNull(body, "webhook_secret"), {
    message: "webhook_secret must be a string or null",
  })
  .refine(
    (body) =>
      !("webhook_threshold" in body) ||
      (typeof body.webhook_threshold === "number" &&
        Number.isInteger(body.webhook_threshold) &&
        body.webhook_threshold >= 0 &&
        body.webhook_threshold <= 100),
    { message: "webhook_threshold must be an integer from 0 to 100" }
  )
  .refine((body) => optionalStringOrNull(body, "siem_url"), {
    message: "siem_url must be a string or null",
  })
  .refine((body) => optionalStringOrNull(body, "siem_secret"), {
    message: "siem_secret must be a string or null",
  })
  .refine((body) => optionalSemanticFailMode(body), {
    message: "semantic_fail_mode must be allow, flag, or block",
  });

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const { db, workspace_id } = auth;

  const { data, error } = await db
    .from("workspaces")
    .select("policy, webhook_url, webhook_secret, webhook_threshold, siem_url, siem_secret, semantic_fail_mode")
    .eq("id", workspace_id)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Workspace not found" }, { status: 404 });

  return Response.json({
    settings: {
      ...(typeof data.policy === "object" && data.policy ? data.policy : {}),
      webhook_url: data.webhook_url ?? "",
      webhook_secret: data.webhook_secret ? MASKED_SECRET : "",
      webhook_secret_configured: Boolean(data.webhook_secret),
      siem_url: data.siem_url ?? "",
      siem_secret: data.siem_secret ? MASKED_SECRET : "",
      siem_secret_configured: Boolean(data.siem_secret),
      semantic_fail_mode: data.semantic_fail_mode ?? "flag",
      webhook_threshold:
        typeof data.webhook_threshold === "number" ? data.webhook_threshold : 70,
    },
  });
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > MAX_SETTINGS_BODY_BYTES) {
      return Response.json({ error: "Request body too large" }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = SettingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 422 });
  }

  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const { db, workspace_id } = auth;
  const forbidden = requireRole(auth, "admin");
  if (forbidden) return forbidden;

  // Separate webhook columns from the JSONB policy blob. Billing and
  // entitlement fields are provider-managed and must never be writable from
  // the dashboard settings surface.
  const policy = { ...parsed.data };
  const { data: currentWorkspace, error: currentWorkspaceError } = await db
    .from("workspaces")
    .select("policy")
    .eq("id", workspace_id)
    .maybeSingle();
  if (currentWorkspaceError || !currentWorkspace) {
    return Response.json({ error: currentWorkspaceError?.message ?? "Workspace not found" }, { status: currentWorkspaceError ? 503 : 404 });
  }
  const currentPolicy = currentWorkspace.policy && typeof currentWorkspace.policy === "object" && !Array.isArray(currentWorkspace.policy)
    ? currentWorkspace.policy as Record<string, unknown>
    : {};
  const webhook_url = policy.webhook_url;
  const webhook_secret = policy.webhook_secret;
  const webhook_threshold = policy.webhook_threshold;
  const siem_url = policy.siem_url;
  const siem_secret = policy.siem_secret;
  const semantic_fail_mode = policy.semantic_fail_mode;
  delete policy.webhook_url;
  delete policy.webhook_secret;
  delete policy.webhook_threshold;
  delete policy.webhook_secret_configured;
  delete policy.siem_url;
  delete policy.siem_secret;
  delete policy.siem_secret_configured;
  delete policy.semantic_fail_mode;
  for (const key of PROVIDER_MANAGED_POLICY_KEYS) delete policy[key];
  const normalizedPolicy = normalizeWorkspacePolicy({
    ...currentPolicy,
    ...policy,
  });
  const update: Record<string, unknown> = { policy: normalizedPolicy };

  if (webhook_url !== undefined) {
    if (typeof webhook_url === "string" && webhook_url.trim()) {
      const validation = await validateWebhookUrl(webhook_url.trim());
      if (!validation.ok || !validation.normalizedUrl) {
        return Response.json({ error: validation.error ?? "Invalid webhook URL" }, { status: 422 });
      }
      update.webhook_url = validation.normalizedUrl;
    } else {
      update.webhook_url = null;
    }
  }

  if (webhook_secret !== undefined && webhook_secret !== MASKED_SECRET) {
    update.webhook_secret =
      typeof webhook_secret === "string" && webhook_secret ? webhook_secret : null;
  }

  if (siem_url !== undefined) {
    if (typeof siem_url === "string" && siem_url.trim()) {
      const validation = await validateWebhookUrl(siem_url.trim());
      if (!validation.ok || !validation.normalizedUrl) {
        return Response.json({ error: validation.error ?? "Invalid SIEM URL" }, { status: 422 });
      }
      update.siem_url = validation.normalizedUrl;
    } else {
      update.siem_url = null;
    }
  }

  if (siem_secret !== undefined && siem_secret !== MASKED_SECRET) {
    update.siem_secret =
      typeof siem_secret === "string" && siem_secret ? siem_secret : null;
  }

  if (webhook_threshold !== undefined) {
    if (
      typeof webhook_threshold !== "number" ||
      !Number.isInteger(webhook_threshold) ||
      webhook_threshold < 0 ||
      webhook_threshold > 100
    ) {
      return Response.json({ error: "webhook_threshold must be an integer from 0 to 100" }, { status: 422 });
    }
    update.webhook_threshold = webhook_threshold;
  }

  if (semantic_fail_mode !== undefined) {
    update.semantic_fail_mode = semantic_fail_mode;
  }

  const { error } = await db
    .from("workspaces")
    .update(update)
    .eq("id", workspace_id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const syncResult = await syncManagedRules(db, workspace_id, normalizedPolicy);
  if (syncResult.error) {
    return Response.json({ error: `Settings saved, but managed rules sync failed: ${syncResult.error}` }, { status: 500 });
  }

  return Response.json({ success: true });
}
