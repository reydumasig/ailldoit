/**
 * Sentry init for the server process.
 *
 * Design choices:
 *  - **Off by default.** Without SENTRY_DSN set, `Sentry.init` is not called
 *    and every `Sentry.captureException` is a no-op. Keeps local dev quiet
 *    and prevents accidental test-data pollution in prod dashboards.
 *  - **Init runs once, as early as possible.** Sentry's Node SDK patches
 *    http/https/undici on init to auto-instrument — any module that creates
 *    an agent or opens a long-lived connection BEFORE init misses that
 *    instrumentation. That's why we import + init this module at the top
 *    of `server/index.ts` before anything else.
 *  - **Express error handler is attached separately.** The SDK provides
 *    `Sentry.expressErrorHandler()` which must be mounted AFTER all routes
 *    but BEFORE the final error-rendering middleware. We export it here and
 *    wire it in `server/index.ts`.
 *  - **User + org scope.** When a request authenticates, middleware calls
 *    `setRequestUser` so Sentry events carry userId and orgId tags. Makes
 *    "customer X is seeing errors" queries instant.
 */

import * as Sentry from "@sentry/node";
import { ENV } from "../config/environment";

let initialized = false;

/** True if Sentry was initialized (DSN was present). */
export function isSentryEnabled(): boolean {
  return initialized;
}

export function initSentry(): void {
  if (!ENV.sentry.dsn) {
    console.log("🔭 SENTRY: disabled (no SENTRY_DSN set) — errors will log to stderr only");
    return;
  }
  if (initialized) return;

  Sentry.init({
    dsn: ENV.sentry.dsn,
    environment: ENV.sentry.environment,
    release: ENV.releaseTag || undefined,
    tracesSampleRate: ENV.sentry.tracesSampleRate,
    // Auto-instrument HTTP + Express. expressIntegration() wires a tracing
    // handler that wraps every route handler so we can see slow endpoints
    // in the Performance tab. httpIntegration() also tracks outbound calls
    // (Stripe, Replicate) as spans so we can attribute latency correctly.
    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
    // Don't send low-value errors: abort signals from client disconnects,
    // expected 4xx business errors that we raise intentionally. These add
    // noise and eat into the Sentry quota.
    ignoreErrors: [
      "InsufficientCreditsError", // 402, not an engineering bug
      "VersionNotFoundError",     // 404, not an engineering bug
      "NoCleanRenditionError",    // 409, not an engineering bug
      "AbortError",               // client disconnect
    ],
    // Scrub obvious secrets from breadcrumbs (req bodies + headers). The
    // default scrubber catches Authorization, but custom keys (e.g.
    // stripe-signature) need explicit listing.
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "http" && breadcrumb.data) {
        delete breadcrumb.data["Authorization"];
        delete breadcrumb.data["authorization"];
        delete breadcrumb.data["stripe-signature"];
      }
      return breadcrumb;
    },
  });

  initialized = true;
  console.log(
    `🔭 SENTRY: initialized (env=${ENV.sentry.environment}, release=${
      ENV.releaseTag || "untagged"
    }, traces=${ENV.sentry.tracesSampleRate})`
  );
}

/**
 * Per-request scope hook. Call from auth middleware once we know who the
 * user is, so any exception that bubbles up is tagged with user+org.
 */
export function setRequestUser(opts: {
  userId?: string | null;
  orgId?: string | null;
  email?: string | null;
}): void {
  if (!initialized) return;
  Sentry.setUser({
    id: opts.userId ?? undefined,
    email: opts.email ?? undefined,
  });
  if (opts.orgId) {
    Sentry.setTag("org_id", opts.orgId);
  }
}

/**
 * Clear the request scope. Sentry scopes are per-request in our setup (see
 * `requestHandler` below), so this is rarely needed — but exported for
 * completeness in worker contexts where we reuse a scope across jobs.
 */
export function clearRequestUser(): void {
  if (!initialized) return;
  Sentry.setUser(null);
}

/**
 * Capture a non-Error value as an exception. Useful for BullMQ worker
 * failures where err may be a string or unknown.
 */
export function captureUnknown(
  err: unknown,
  context?: Record<string, unknown>
): void {
  if (!initialized) return;
  if (context) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
      Sentry.captureException(err);
    });
  } else {
    Sentry.captureException(err);
  }
}

/** Re-export Sentry so callers don't need to import the SDK directly. */
export { Sentry };
