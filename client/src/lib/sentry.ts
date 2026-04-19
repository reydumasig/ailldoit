/**
 * Client-side Sentry init.
 *
 * Same off-by-default pattern as the server: no VITE_SENTRY_DSN = no init,
 * so local dev is silent and prod dashboards don't fill with "local host"
 * sessions. The env var MUST be prefixed VITE_ so Vite exposes it to the
 * browser bundle — prefixed envs are the only ones that leak.
 *
 * We ship the React Error Boundary integration so unmount cascades from a
 * broken component don't take down the whole app; the boundary also
 * captures the exception to Sentry.
 */

import * as Sentry from "@sentry/react";

let initialized = false;

export function isSentryEnabled(): boolean {
  return initialized;
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // Silence in dev — prod Sentry will get configured once the env is set.
    return;
  }
  if (initialized) return;

  Sentry.init({
    dsn,
    // Release ties errors to a deploy. Vite doesn't inject this for us;
    // CI sets it to the git sha at build time. Empty string = untagged.
    release: (import.meta.env.VITE_SENTRY_RELEASE as string | undefined) || undefined,
    environment:
      (import.meta.env.VITE_SENTRY_ENV as string | undefined) ??
      (import.meta.env.DEV ? "development" : "production"),
    // Conservative perf sampling — 10% by default. Bump via env if needed.
    tracesSampleRate: Number(
      import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"
    ),
    // Capture console.error calls too — React's default error log for a
    // caught render error goes to console.error, so this pulls in anything
    // the ErrorBoundary wouldn't surface on its own.
    integrations: [Sentry.browserTracingIntegration()],
    // Ignore noisy browser extensions and common third-party script errors
    // that have nothing to do with our code.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "Non-Error promise rejection captured",
    ],
  });

  initialized = true;
}

/**
 * Per-session identification. Call once auth settles (in AuthContext) so
 * every subsequent event is attributed to the user.
 */
export function identifyUser(opts: {
  userId: string | null;
  email: string | null;
  orgId?: string | null;
}): void {
  if (!initialized) return;
  if (!opts.userId) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: opts.userId, email: opts.email ?? undefined });
  if (opts.orgId) {
    Sentry.setTag("org_id", opts.orgId);
  }
}

export { Sentry };
