// Client-side environment configuration
export interface ClientEnvironmentConfig {
  isDevelopment: boolean;
  isProduction: boolean;
  domain: string;
  stripe: {
    publicKey: string;
    starterPriceId: string;
    growthPriceId: string;
  };
}

export function getClientEnvironment(): ClientEnvironmentConfig {
  const isDevelopment = import.meta.env.DEV;
  const isProduction = import.meta.env.PROD;
  
  // Detect if we're on production domain
  const isLiveDomain = window.location.hostname.includes('ailldoit.com');
  
  // Use live keys for production domain, test keys for development
  const useTestKeys = isDevelopment || !isLiveDomain;
  
  console.log('🌍 Client Environment:', {
    hostname: window.location.hostname,
    isLiveDomain,
    useTestKeys,
    mode: isDevelopment ? 'development' : 'production'
  });
  
  return {
    isDevelopment,
    isProduction,
    domain: isLiveDomain ? 'app.ailldoit.com' : 'localhost',
    stripe: {
      publicKey: useTestKeys 
        ? import.meta.env.VITE_STRIPE_PUBLIC_KEY 
        : import.meta.env.VITE_STRIPE_LIVE_PUBLIC_KEY,
      starterPriceId: useTestKeys 
        ? import.meta.env.VITE_STRIPE_STARTER_PRICE_ID 
        : import.meta.env.VITE_STRIPE_LIVE_STARTER_PRICE_ID,
      growthPriceId: useTestKeys 
        ? import.meta.env.VITE_STRIPE_GROWTH_PRICE_ID 
        : import.meta.env.VITE_STRIPE_LIVE_GROWTH_PRICE_ID
    }
  };
}

// Export current environment
export const CLIENT_ENV = getClientEnvironment();