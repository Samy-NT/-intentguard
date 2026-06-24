import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN),
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
  // Scrub agent_context from all server events — it may contain sensitive payment instructions
  beforeSend(event) {
    if (event.request?.data) {
      const data = event.request.data;
      if (typeof data === "object" && data !== null && "agent_context" in data) {
        (data as Record<string, unknown>).agent_context = "[redacted]";
      }
    }
    return event;
  },
});
