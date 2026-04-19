/**
 * Server-side PostHog wiring.
 *
 * PostHog is our product-analytics funnel for the photo module. We capture
 * events server-side for anything that has a real-world consequence
 * (credit debit, render completion, Stripe webhook) so the funnel stays
 * honest even when browsers block client-side analytics. The client still
 * initializes its own PostHog for session replay / UI-interaction events
 * (see client/src/lib/posthog.ts), but the funnel-of-record is here.
 *
 * Same off-by-default pattern as Sentry: if POSTHOG_API_KEY is missing we
 * skip init entirely and every `track()` call is a noop. This keeps local
 * development silent and prevents dev machines from polluting prod funnels.
 */
import { PostHog } from "posthog-node";
import { ENV } from "../config/environment";

let client: PostHog | null = null;

export function isPostHogEnabled(): boolean {
  return client !== null;
}

export function initPostHog(): void {
  if (client) return;
  const { apiKey, host } = ENV.posthog;
  if (!apiKey) {
    // No key → stay silent in dev. Prod will configure via env.
    return;
  }
  client = new PostHog(apiKey, {
    host,
    // Flush on a short interval so webhook-triggered events don't sit in
    // memory forever when the process is low-traffic (Cloud Run can idle).
    flushAt: 20,
    flushInterval: 10_000,
    // Disable feature-flag polling — we don't use flags server-side yet.
    disableGeoip: true,
  });
}

/**
 * Properties every server event should carry. We attach the release tag so
 * PostHog dashboards can slice regressions by deploy, and the environment
 * so staging traffic doesn't pollute prod reports.
 */
function baseProps(): Record<string, unknown> {
  return {
    release: ENV.releaseTag || undefined,
    environment: ENV.sentry.environment, // reuse same 3-value enum
    source: "server",
  };
}

/**
 * Supported photo-module events. Keeping this union explicit forces the
 * call sites through the type checker — a typo in an event name would
 * otherwise silently fork the funnel into two dashboards.
 */
export type PhotoEvent =
  | "photo_project_created"
  | "photo_assets_uploaded"
  | "photo_bracket_detected"
  | "photo_render_requested"
  | "photo_render_completed"
  | "photo_render_failed"
  | "photo_credits_purchased"
  | "photo_unlock_attempted"
  | "photo_unlock_succeeded"
  | "photo_unlock_insufficient_credits"
  | "photo_download_completed"
  | "photo_batch_download_started";

export interface TrackOpts {
  /** Our internal user id. Use `null` for events that happen with no user
   * context (e.g. background jobs triggered by cron). */
  userId: string | null;
  /** Optional org id — attach it as a property (not a group) so we can
   * filter the funnel per-org without paying for group analytics. */
  orgId?: string | null;
  /** Event-specific properties. Will be merged with baseProps. */
  props?: Record<string, unknown>;
}

/**
 * Record one funnel event. Swallows all errors: we never want an analytics
 * failure to take down a revenue-critical code path (unlock/download).
 */
export function track(event: PhotoEvent, opts: TrackOpts): void {
  if (!client) return;
  try {
    client.capture({
      // PostHog requires a distinctId — use the user id when we have it,
      // otherwise a deterministic "anon" tag that still lets the event
      // land in the funnel but won't be tied to a profile.
      distinctId: opts.userId ?? "anonymous-server",
      event,
      properties: {
        ...baseProps(),
        org_id: opts.orgId ?? undefined,
        ...opts.props,
      },
    });
  } catch (err: any) {
    // Keep quiet — don't throw out of a capture. Log once so the absence
    // of events in the dashboard has a breadcrumb.
    console.error("❌ POSTHOG: capture failed for", event, err?.message ?? err);
  }
}

/**
 * Tie a Firebase/internal user id to a set of person properties. Called
 * once from the auth middleware after a user logs in, so subsequent events
 * land on the right PostHog profile.
 */
export function identify(opts: {
  userId: string;
  email: string | null;
  orgId?: string | null;
}): void {
  if (!client) return;
  try {
    client.identify({
      distinctId: opts.userId,
      properties: {
        email: opts.email ?? undefined,
        org_id: opts.orgId ?? undefined,
      },
    });
  } catch (err: any) {
    console.error("❌ POSTHOG: identify failed:", err?.message ?? err);
  }
}

/**
 * Flush pending events and shut down the HTTP client. Called from the
 * graceful-shutdown path in server/index.ts so Cloud Run scale-down
 * doesn't drop the last batch of events.
 */
export async function shutdownPostHog(): Promise<void> {
  if (!client) return;
  try {
    await client.shutdown();
  } catch (err: any) {
    console.error("⚠️  POSTHOG: shutdown errored:", err?.message ?? err);
  }
  client = null;
}
