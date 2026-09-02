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

const REQUIRED_ENV_NAMES = new Set<string>(REQUIRED_ENV.map(([key]) => key));
const SECRET_ENV_NAMES = new Set<string>([
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
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
] as const;

const DB_CHECK_TIMEOUT_MS = 1500;

export function buildEnvReadiness(env: EnvLike = process.env): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];

  for (const [key, detail] of REQUIRED_ENV) {
    checks.push(validateEnvValue(key, env[key], detail, true));
  }

  for (const [key, detail] of RECOMMENDED_ENV) {
    checks.push(validateEnvValue(key, env[key], detail, false));
  }

  for (const [key, detail] of OPTIONAL_SECRET_LIST_ENV) {
    if (env[key]) checks.push(validateSecretListEnv(key, env[key], detail));
  }

  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    checks.push({
      name: "env.UPSTASH_REDIS",
      status: "warn",
      detail: "Upstash Redis is recommended for distributed production rate limiting",
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
