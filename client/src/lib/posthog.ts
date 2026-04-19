/**
 * Client-side PostHog init.
 *
 * Off-by-default: missing VITE_POSTHOG_KEY = no init, every call is a
 * noop. Local dev stays silent so we don't pollute prod funnels.
 *
 * Scope: we track UI-interaction + session events here. The billing-
 * critical funnel events (unlock, download, render complete, purchase)
 * fire server-side — see server/observability/posthog.ts — so they
 * can't be blocked by ad-blockers or network flakes.
 */
import posthog from "posthog-js";

let initialized = false;

export function isPostHogEnabled(): boolean {
  return initialized;
}

export function initPostHog(): void {
  if (initialized) return;
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key) return; // Silent in dev / when the env isn't configured.

  const host =
    (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
    "https://us.i.posthog.com";

  posthog.init(key, {
    api_host: host,
    // Autocapture covers clicks/pageviews without us hand-instrumenting
    // every button. Server-side emits cover the funnel of record.
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    // Session recording: off by default for privacy until we turn it on
    // in the dashboard. Flip via PostHog project settings, not env.
    disable_session_recording: true,
    // Bootstrap flag — if it's set by the server we can read it here
    // later. Leaving as noop for now.
    loaded: (ph) => {
      if (import.meta.env.DEV) ph.debug(false);
    },
  });
  initialized = true;
}

export function identifyUser(opts: {
  userId: string | null;
  email: string | null;
}): void {
  if (!initialized) return;
  if (!opts.userId) {
    posthog.reset(); // logout — new distinctId, forget the old profile
    return;
  }
  posthog.identify(opts.userId, {
    email: opts.email ?? undefined,
  });
}

export { posthog };
