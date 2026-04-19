export interface EnvironmentConfig {
  isDevelopment: boolean;
  isProduction: boolean;
  domain: string;
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
}

export function getEnvironmentConfig(): EnvironmentConfig {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';

  // Detect domain from environment or default
  const domain = process.env.DOMAIN || 'localhost';
  const isLiveDomain = isProduction && domain.includes('app.ailldoit.com');

  // Use live keys for production domain, test keys for development
  const useTestKeys = isDevelopment || !isLiveDomain;

  return {
    isDevelopment,
    isProduction,
    domain,
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