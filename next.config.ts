import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent webpack from bundling Supabase — its browser/node export conditions
  // cause "__webpack_modules__[moduleId] is not a function" in the server bundle.
  // Let Node.js load these at runtime instead.
  serverExternalPackages: ["@supabase/supabase-js", "@supabase/ssr"],
};

// withSentryConfig (source map upload) is intentionally omitted.
// Runtime error capture is still active via sentry.{client,server,edge}.config.ts.
// To re-enable source map upload, add SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT
// to your environment and wrap nextConfig with withSentryConfig here.

export default nextConfig;
