export interface EnvironmentConfig {
  isDevelopment: boolean;
  isProduction: boolean;
  domain: string;
  stripe: {
    secretKey: string;
    publicKey: string;
    starterPriceId: string;
    growthPriceId: string;
    webhookSecret: string;
  };
}

export function getEnvironmentConfig(): EnvironmentConfig {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Detect domain from environment or default
  const currentDomain = process.env.CLOUD_RUN_SERVICE_URL || process.env.DOMAIN || 'localhost';
  const isLiveDomain = currentDomain.includes('app.ailldoit.com');
  
  // Use live keys for production domain, test keys for development
  const useTestKeys = isDevelopment || !isLiveDomain;
  
  return {
    isDevelopment,
    isProduction,
    domain: isLiveDomain ? 'app.ailldoit.com' : 'localhost',
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