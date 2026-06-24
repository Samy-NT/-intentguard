import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Prevent webpack from bundling Supabase — its browser/node export conditions
  // cause "__webpack_modules__[moduleId] is not a function" in the server bundle.
  // Let Node.js load these at runtime instead.
  serverExternalPackages: ["@supabase/supabase-js", "@supabase/ssr"],
};

export default withSentryConfig(nextConfig, {
  // Only active when SENTRY_AUTH_TOKEN is set — safe to deploy without it
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  // Don't fail the build when Sentry is not fully configured
  errorHandler(err) {
    console.warn("[sentry] Build plugin warning:", (err as Error).message);
  },
});
