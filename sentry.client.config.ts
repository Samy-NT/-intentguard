import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
  // Never send raw request bodies — agent_context may contain sensitive instructions
  beforeSend(event) {
    if (event.request?.data) {
      delete event.request.data;
    }
    return event;
  },
});
