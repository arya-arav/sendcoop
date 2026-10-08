import type { Instrumentation } from "next";

// Error reporting (D81): with SENTRY_DSN set, errors in pages, route
// handlers and server actions go to Sentry. Without it, nothing is sent.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      release: process.env.SENDCOOP_RELEASE,
      tracesSampleRate: 0,
    });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/node");
  Sentry.captureException(error, {
    extra: {
      method: request.method,
      // The path only: query strings can hold tokens.
      path: request.path.split("?")[0],
      routePath: context.routePath,
      routeType: context.routeType,
    },
  });
};
