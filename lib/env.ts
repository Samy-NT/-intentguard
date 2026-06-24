/**
 * Validates required env vars at module load time.
 * Call this at the top of any API route handler.
 * Throws a clear error in dev; logs and throws in production.
 */

const REQUIRED: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "Supabase project URL",
  SUPABASE_SERVICE_ROLE_KEY: "Supabase service role key (server-side only)",
  ANTHROPIC_API_KEY: "Anthropic API key for Claude semantic analysis",
};

export function assertEnv(): void {
  const missing = Object.entries(REQUIRED)
    .filter(([key]) => !process.env[key])
    .map(([key, desc]) => `  ${key} — ${desc}`);

  if (missing.length > 0) {
    throw new Error(
      `[intentguard] Missing required environment variables:\n${missing.join("\n")}\n\nCheck .env.local or your deployment environment.`
    );
  }
}

/** Safe accessor — throws if the var is missing instead of returning undefined */
export function env(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`[intentguard] Missing env var: ${key}`);
  return value;
}
