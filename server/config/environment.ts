export interface EnvironmentConfig {
  isDevelopment: boolean;
  isProduction: boolean;
  domain: string;
  /** Release tag (git sha or app version). Sent to Sentry so we can pin
   * errors to a deploy. Empty string means "don't tag a release." */
  releaseTag: string;
  stripe: {
    secretKey: string;
    publicKey: string;
    // Ad-generator subscription SKUs (recurring plans)
    starterPriceId: string;
    growthPriceId: string;
    // Photo module credit-pack SKUs (one-time Checkout purchases).
    // Packs are deliberately separate from the subscription SKUs — photo billing
    // is pay-per-image via credits, not a recurring plan.
    photoStarterPackPriceId: string;   // starter pack (e.g. 100 credits)
    photoGrowthPackPriceId: string;    // growth  pack (e.g. 500 credits)
    photoAgencyPackPriceId: string;    // agency  pack (e.g. 2000 credits)
    webhookSecret: string;
  };
  /**
   * Observability. Both providers follow the same "cloud-services-off-by-default"
   * pattern — empty string means the SDK noops, so local development doesn't
   * leak test data into prod dashboards. Populate the envs in prod to turn them on.
   */
  sentry: {
    dsn: string;                // empty = disabled (noop client)
    tracesSampleRate: number;   // 0..1 — how much perf tracing to sample
    environment: string;        // "production" | "staging" | "development"
  };
  posthog: {
    apiKey: string;             // empty = disabled (server-side noop)
    host: string;               // usually https://us.i.posthog.com
  };
}

export function getEnvironmentConfig(): EnvironmentConfig {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';

  // Detect domain from environment or default
  const domain = process.env.DOMAIN || 'localhost';
  const isLiveDomain = isProduction && domain.includes('app.ailldoit.com');

  // Use live keys for production domain, test keys for development
  const useTestKeys = isDevelopment || !isLiveDomain;

  // Release tag: prefer an explicit SENTRY_RELEASE env (set by CI to the git
  // sha), fall back to GIT_SHA, else empty. Avoid calling `git rev-parse` at
  // runtime — the container doesn't ship with git.
  const releaseTag =
    process.env.SENTRY_RELEASE ?? process.env.GIT_SHA ?? "";

  return {
    isDevelopment,
    isProduction,
    domain,
    releaseTag,
    stripe: {
      secretKey: useTestKeys 
        ? process.env.STRIPE_SECRET_KEY! 
        : process.env.STRIPE_LIVE_SECRET_KEY!,
      publicKey: useTestKeys 
        ? process.env.VITE_STRIPE_PUBLIC_KEY! 
        : process.env.VITE_STRIPE_LIVE_PUBLIC_KEY!,
      starterPriceId: useTestKeys
        ? process.env.VITE_STRIPE_STARTER_PRICE_ID!
        : process.env.VITE_STRIPE_LIVE_STARTER_PRICE_ID!,
      growthPriceId: useTestKeys
        ? process.env.VITE_STRIPE_GROWTH_PRICE_ID!
        : process.env.VITE_STRIPE_LIVE_GROWTH_PRICE_ID!,
      // Photo pack price IDs — fall back to "" when unset so the service can
      // detect "packs not configured" and surface a friendly error instead of
      // crashing at startup. Expect the three envs to be filled in once Rey
      // has created the SKUs in Stripe dashboard.
      photoStarterPackPriceId: useTestKeys
        ? (process.env.VITE_STRIPE_PHOTO_STARTER_PACK_PRICE_ID ?? "")
        : (process.env.VITE_STRIPE_LIVE_PHOTO_STARTER_PACK_PRICE_ID ?? ""),
      photoGrowthPackPriceId: useTestKeys
        ? (process.env.VITE_STRIPE_PHOTO_GROWTH_PACK_PRICE_ID ?? "")
        : (process.env.VITE_STRIPE_LIVE_PHOTO_GROWTH_PACK_PRICE_ID ?? ""),
      photoAgencyPackPriceId: useTestKeys
        ? (process.env.VITE_STRIPE_PHOTO_AGENCY_PACK_PRICE_ID ?? "")
        : (process.env.VITE_STRIPE_LIVE_PHOTO_AGENCY_PACK_PRICE_ID ?? ""),
      webhookSecret: useTestKeys
        ? process.env.STRIPE_WEBHOOK_SECRET!
        : process.env.STRIPE_LIVE_WEBHOOK_SECRET!
    },
    sentry: {
      // Server DSN only — the client uses VITE_SENTRY_DSN (exposed to browser).
      // Sentry treats empty DSN as "disable" which is exactly the dev default.
      dsn: process.env.SENTRY_DSN ?? "",
      // 10% tracing by default — enough to spot regressions without billing
      // us into oblivion. Bump via env if a real issue needs deeper insight.
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
      environment: isProduction
        ? (isLiveDomain ? "production" : "staging")
        : "development",
    },
    posthog: {
      // Server-side PostHog. The server-side key is separate from
      // VITE_POSTHOG_KEY (which is public, shipped to browser). We capture
      // billing-critical events server-side so they can't be tampered with
      // or blocked by ad blockers.
      apiKey: process.env.POSTHOG_API_KEY ?? "",
      host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
    }
  };
}

// Export current environment
export const ENV = getEnvironmentConfig();

console.log('🌍 Environment Configuration:', {
  mode: ENV.isDevelopment ? 'development' : 'production',
  domain: ENV.domain,
  stripeMode: ENV.domain.includes('ailldoit.com') ? 'LIVE' : 'TEST'
});