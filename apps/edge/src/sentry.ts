import * as Sentry from "@sentry/node";

// Error reporting (D81): with SENTRY_DSN set, unexpected errors go to
// Sentry as well as the log. Without it, nothing is sent anywhere.

const enabled = Boolean(process.env.SENTRY_DSN);

if (enabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    release: process.env.SENDCOOP_RELEASE,
    // Errors only: no performance tracing.
    tracesSampleRate: 0,
  });
}

export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (enabled) Sentry.captureException(error, { extra: context });
}
