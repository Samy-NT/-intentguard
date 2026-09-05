import type { SupabaseClient } from "@supabase/supabase-js";

export type ReadinessStatus = "pass" | "warn" | "fail";

export interface ReadinessCheck {
  name: string;
  status: ReadinessStatus;
  detail: string;
}

export interface ReadinessReport {
  status: ReadinessStatus;
  checked_at: string;
  checks: ReadinessCheck[];
}

type EnvLike = Record<string, string | undefined>;

const REQUIRED_ENV = [
  ["NEXT_PUBLIC_SUPABASE_URL", "Supabase URL is configured"],
  ["SUPABASE_SERVICE_ROLE_KEY", "Supabase service role is configured"],
  ["ANTHROPIC_API_KEY", "Anthropic semantic layer key is configured"],
] as const;

const RECOMMENDED_ENV = [
  ["INTENTGUARD_SECRET", "API key pepper is configured"],
  ["DASHBOARD_SESSION_SECRET", "Dedicated dashboard session secret is configured"],
  ["AUDIT_SIGNING_SECRET", "Dedicated audit signing secret is configured"],
  ["MANDATE_SIGNING_SECRET", "Dedicated mandate signing secret is configured"],
  ["CRON_SECRET", "Cron endpoint bearer secret is configured"],
] as const;

const OPTIONAL_SECRET_LIST_ENV = [
  ["AUDIT_SIGNING_PREVIOUS_SECRETS", "Previous audit signing secrets are configured for historical verification"],
  ["MANDATE_SIGNING_PREVIOUS_SECRETS", "Previous mandate signing secrets are configured for historical verification"],
] as const;

const REQUIRED_ENV_NAMES = new Set<string>([
  ...REQUIRED_ENV.map(([key]) => key),
  "NEXT_PUBLIC_SUPABASE_BROWSER_KEY",
]);
const SECRET_ENV_NAMES = new Set<string>([
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  ...RECOMMENDED_ENV.map(([key]) => key),
]);

const MIN_SECRET_LENGTH = 32;

const PLACEHOLDER_PATTERNS = [
  /your[-_]/i,
  /^sk-ant-your/i,
  /example/i,
  /placeholder/i,
  /change[-_]?me/i,
  /replace[-_]?me/i,
  /replace[-_]?with/i,
];

const PLACEHOLDER_VALUES = new Set(["service", "token", "secret", "password", "pepper", "audit", "mandate", "cron"]);

const EXPECTED_TABLES = [
  "workspaces",
  "api_keys",
  "rules",
  "verify_logs",
  "webhook_jobs",
  "webhook_deliveries",
  "mandates",
  "action_audit_logs",
  "action_telemetry_events",
  "verification_usage_reservations",
  "verification_usage_counters",
  "billing_events",
  "workspace_members",
] as const;

const DB_CHECK_TIMEOUT_MS = 1500;

export function buildEnvReadiness(env: EnvLike = process.env): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];
  const production = env.NODE_ENV === "production";

  for (const [key, detail] of REQUIRED_ENV) {
    checks.push(validateEnvValue(key, env[key], detail, true));
  }
  checks.push(validateSupabaseBrowserKey(env));

  for (const [key, detail] of RECOMMENDED_ENV) {
    checks.push(validateEnvValue(key, env[key], detail, production));
  }

  for (const [key, detail] of OPTIONAL_SECRET_LIST_ENV) {
    if (env[key]) checks.push(validateSecretListEnv(key, env[key], detail));
  }

  checks.push(validateSupportEnv(env));
  checks.push(...validateBillingEnv(env));

  if (env.NODE_ENV === "production" && parseAllowedOrigins(env.ALLOWED_ORIGINS).length === 0) {
    checks.push({
      name: "env.ALLOWED_ORIGINS",
      status: "fail",
      detail: "ALLOWED_ORIGINS must contain an explicit browser origin allowlist in production",
    });
  }

  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    checks.push({
      name: "env.UPSTASH_REDIS",
      status: production ? "fail" : "warn",
      detail: production
        ? "Upstash Redis is required for distributed production rate limiting"
        : "Upstash Redis is recommended for distributed production rate limiting",
    });
  } else if (!isValidHttpUrl(env.UPSTASH_REDIS_REST_URL)) {
    checks.push({
      name: "env.UPSTASH_REDIS",
      status: "fail",
      detail: "UPSTASH_REDIS_REST_URL must be a valid HTTP(S) URL",
    });
  } else if (isPlaceholderValue(env.UPSTASH_REDIS_REST_URL) || isPlaceholderValue(env.UPSTASH_REDIS_REST_TOKEN)) {
    checks.push({
      name: "env.UPSTASH_REDIS",
      status: "fail",
      detail: "Upstash Redis configuration still contains a placeholder value",
    });
  } else if (env.UPSTASH_REDIS_REST_TOKEN.trim().length < MIN_SECRET_LENGTH) {
    checks.push({
      name: "env.UPSTASH_REDIS",
      status: "fail",
      detail: `UPSTASH_REDIS_REST_TOKEN must be at least ${MIN_SECRET_LENGTH} characters`,
    });
  } else {
    checks.push({
      name: "env.UPSTASH_REDIS",
      status: "pass",
      detail: "Distributed rate limiting is configured",
    });
  }

  return checks;
}

function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function validateSupabaseBrowserKey(env: EnvLike): ReadinessCheck {
  const publishable = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const value = publishable || anon;
  const source = publishable ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" : "NEXT_PUBLIC_SUPABASE_ANON_KEY";

  if (!value) {
    return {
      name: "env.NEXT_PUBLIC_SUPABASE_BROWSER_KEY",
      status: "fail",
      detail: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing",
    };
  }

  if (isPlaceholderValue(value)) {
    return {
      name: "env.NEXT_PUBLIC_SUPABASE_BROWSER_KEY",
      status: "fail",
      detail: `${source} still contains a placeholder value`,
    };
  }

  return {
    name: "env.NEXT_PUBLIC_SUPABASE_BROWSER_KEY",
    status: "pass",
    detail: publishable
      ? "Supabase publishable browser key is configured"
      : "Supabase legacy anonymous browser key is configured",
  };
}

export async function buildDatabaseReadiness(db: SupabaseClient): Promise<ReadinessCheck[]> {
  return Promise.all(EXPECTED_TABLES.map((table) => checkTable(db, table)));
}

export function summarizeReadiness(checks: ReadinessCheck[]): ReadinessStatus {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warn")) return "warn";
  return "pass";
}

export async function buildReadinessReport(
  dbFactory: () => SupabaseClient,
  env: EnvLike = process.env
): Promise<ReadinessReport> {
  const envChecks = buildEnvReadiness(env);
  const hasRequiredEnv = envChecks.every((check) => {
    if (!check.name.startsWith("env.")) return true;
    const key = check.name.slice("env.".length);
    return !REQUIRED_ENV_NAMES.has(key) || check.status !== "fail";
  });

  const dbChecks = hasRequiredEnv
    ? await buildDatabaseReadiness(dbFactory())
    : [
        {
          name: "db.connection",
          status: "fail" as const,
          detail: "Skipped because required environment variables are missing or invalid",
        },
      ];

  const checks = [...envChecks, ...dbChecks];
  return {
    status: summarizeReadiness(checks),
    checked_at: new Date().toISOString(),
    checks,
  };
}

async function checkTable(db: SupabaseClient, table: string): Promise<ReadinessCheck> {
  try {
    const { error } = await withTimeout(
      db.from(table).select("*", { count: "exact", head: true }).limit(1),
      DB_CHECK_TIMEOUT_MS
    );
    return {
      name: `db.${table}`,
      status: error ? "fail" : "pass",
      detail: error ? error.message : `${table} is reachable`,
    };
  } catch (error) {
    return {
      name: `db.${table}`,
      status: "fail",
      detail: error instanceof Error ? error.message : "Table check failed",
    };
  }
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`readiness check exceeded ${timeoutMs}ms`)), timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function validateEnvValue(key: string, rawValue: string | undefined, readyDetail: string, required: boolean): ReadinessCheck {
  const value = rawValue?.trim();

  if (!value) {
    return {
      name: `env.${key}`,
      status: required ? "fail" : "warn",
      detail: required ? `${key} is missing` : `${key} is recommended for production`,
    };
  }

  if (key === "NEXT_PUBLIC_SUPABASE_URL" && !isValidHttpUrl(value)) {
    return {
      name: `env.${key}`,
      status: "fail",
      detail: `${key} must be a valid HTTP(S) URL`,
    };
  }

  if (isPlaceholderValue(value)) {
    return {
      name: `env.${key}`,
      status: "fail",
      detail: `${key} still contains a placeholder value`,
    };
  }

  if (SECRET_ENV_NAMES.has(key) && value.length < MIN_SECRET_LENGTH) {
    return {
      name: `env.${key}`,
      status: "fail",
      detail: `${key} must be at least ${MIN_SECRET_LENGTH} characters`,
    };
  }

  return {
    name: `env.${key}`,
    status: "pass",
    detail: readyDetail,
  };
}

function validateSecretListEnv(key: string, rawValue: string | undefined, readyDetail: string): ReadinessCheck {
  const secrets = rawValue?.split(",").map((secret) => secret.trim()).filter(Boolean) ?? [];

  if (secrets.length === 0) {
    return {
      name: `env.${key}`,
      status: "fail",
      detail: `${key} must contain at least one secret when configured`,
    };
  }

  if (secrets.some(isPlaceholderValue)) {
    return {
      name: `env.${key}`,
      status: "fail",
      detail: `${key} still contains a placeholder value`,
    };
  }

  if (secrets.some((secret) => secret.length < MIN_SECRET_LENGTH)) {
    return {
      name: `env.${key}`,
      status: "fail",
      detail: `${key} entries must be at least ${MIN_SECRET_LENGTH} characters`,
    };
  }

  return {
    name: `env.${key}`,
    status: "pass",
    detail: readyDetail,
  };
}

function validateSupportEnv(env: EnvLike): ReadinessCheck {
  const url = env.SUPPORT_WEBHOOK_URL?.trim();
  const secret = env.SUPPORT_WEBHOOK_SECRET?.trim();

  if (!url) {
    return {
      name: "env.SUPPORT_WEBHOOK",
      status: "warn",
      detail: "SUPPORT_WEBHOOK_URL is recommended for production ticket ingestion",
    };
  }

  if (!isValidHttpUrl(url)) {
    return {
      name: "env.SUPPORT_WEBHOOK",
      status: "fail",
      detail: "SUPPORT_WEBHOOK_URL must be a valid HTTP(S) URL",
    };
  }

  if (!isHttpsUrl(url)) {
    return {
      name: "env.SUPPORT_WEBHOOK",
      status: "fail",
      detail: "SUPPORT_WEBHOOK_URL must use HTTPS",
    };
  }

  if (isPlaceholderValue(url) || (secret && isPlaceholderValue(secret))) {
    return {
      name: "env.SUPPORT_WEBHOOK",
      status: "fail",
      detail: "Support webhook configuration still contains a placeholder value",
    };
  }

  if (secret && secret.length < MIN_SECRET_LENGTH) {
    return {
      name: "env.SUPPORT_WEBHOOK",
      status: "fail",
      detail: `SUPPORT_WEBHOOK_SECRET must be at least ${MIN_SECRET_LENGTH} characters when configured`,
    };
  }

  return {
    name: "env.SUPPORT_WEBHOOK",
    status: secret ? "pass" : "warn",
    detail: secret
      ? "Support ticket ingestion webhook is configured"
      : "SUPPORT_WEBHOOK_SECRET is recommended for signed support ticket delivery",
  };
}

function validateBillingEnv(env: EnvLike): ReadinessCheck[] {
  const provider = env.BILLING_PROVIDER?.trim().toLowerCase();
  const hasStripeValues = Boolean(
    env.STRIPE_SECRET_KEY?.trim() || env.STRIPE_WEBHOOK_SECRET?.trim() ||
      env.STRIPE_PRICE_STARTER?.trim() || env.STRIPE_PRICE_PILOT?.trim() || env.STRIPE_PRICE_ENTERPRISE?.trim()
  );

  if (!provider && !hasStripeValues) {
    return [{ name: "env.BILLING", status: "pass", detail: "Manual billing mode is active; provider-owned entitlements are disabled" }];
  }
  if (provider !== "stripe") {
    return [{ name: "env.BILLING", status: "fail", detail: "BILLING_PROVIDER must be 'stripe' when billing provider settings are present" }];
  }

  const checks: ReadinessCheck[] = [
    validateEnvValue("STRIPE_SECRET_KEY", env.STRIPE_SECRET_KEY, "Stripe API secret is configured", true),
    validateEnvValue("STRIPE_WEBHOOK_SECRET", env.STRIPE_WEBHOOK_SECRET, "Stripe webhook signing secret is configured", true),
  ];
  for (const plan of ["STARTER", "PILOT", "ENTERPRISE"]) {
    const key = `STRIPE_PRICE_${plan}`;
    const value = env[key]?.trim();
    checks.push({
      name: `env.${key}`,
      status: value && !isPlaceholderValue(value) ? "pass" : "fail",
      detail: value && !isPlaceholderValue(value) ? `${key} is configured` : `${key} is missing or contains a placeholder value`,
    });
  }

  const limitsRaw = env.STRIPE_PLAN_LIMITS?.trim();
  let limitsValid = false;
  if (limitsRaw) {
    try {
      const limits = JSON.parse(limitsRaw) as Record<string, unknown>;
      limitsValid = ["starter", "pilot", "enterprise"].every((plan) => {
        const value = limits[plan];
        return value === null || (typeof value === "number" && Number.isInteger(value) && value > 0);
      });
    } catch {
      limitsValid = false;
    }
  }
  checks.push({
    name: "env.STRIPE_PLAN_LIMITS",
    status: limitsValid ? "pass" : "fail",
    detail: limitsValid ? "Stripe plans have explicit verification entitlements" : "STRIPE_PLAN_LIMITS must be JSON with positive integer or null limits for all plans",
  });

  const appUrl = env.BILLING_APP_URL?.trim() || env.NEXT_PUBLIC_APP_URL?.trim();
  let validAppUrl = false;
  try {
    const parsed = appUrl ? new URL(appUrl) : null;
    validAppUrl = Boolean(parsed && (env.NODE_ENV !== "production" || parsed.protocol === "https:"));
  } catch {
    validAppUrl = false;
  }
  checks.push({
    name: "env.BILLING_APP_URL",
    status: validAppUrl ? "pass" : "fail",
    detail: validAppUrl ? "Billing return URLs are configured" : "BILLING_APP_URL (or NEXT_PUBLIC_APP_URL) must be a valid URL and HTTPS in production",
  });
  return checks;
}

function isPlaceholderValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_VALUES.has(normalized) || PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
