import { createBrowserClient } from "@supabase/ssr";

/** Public browser client — read-only / anon scoped */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
