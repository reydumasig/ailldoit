# Production Deployment Guide for app.ailldoit.com

## Overview
This guide covers deploying Ailldoit to production with live Stripe keys while keeping development environment with test keys.

## 1. Environment Configuration System

The system automatically detects the environment and uses appropriate keys:

- **Development**: Uses test Stripe keys (pk_test_*, sk_test_*)
- **Production**: Uses live Stripe keys (pk_live_*, sk_live_*)

### Environment Detection Logic:
- If `REPLIT_DOMAINS` contains `app.ailldoit.com` → Uses LIVE keys
- Otherwise → Uses TEST keys

## 2. Required Secrets for Production

Add these secrets to your Replit deployment:

### Stripe LIVE Keys (Production Only)
```
STRIPE_LIVE_SECRET_KEY=sk_live_your_actual_live_secret_key
VITE_STRIPE_LIVE_PUBLIC_KEY=pk_live_your_actual_live_public_key
VITE_STRIPE_LIVE_STARTER_PRICE_ID=price_live_your_starter_price_id
VITE_STRIPE_LIVE_GROWTH_PRICE_ID=price_live_your_growth_price_id
STRIPE_LIVE_WEBHOOK_SECRET=whsec_live_your_webhook_secret
```

### Domain Configuration
```
REPLIT_DOMAINS=app.ailldoit.com
NODE_ENV=production
```

### Database (Production)
```
DATABASE_URL=your_production_postgresql_url
```

### Firebase (Production Project)
```
VITE_FIREBASE_PROJECT_ID=your_production_project_id
FIREBASE_SERVICE_ACCOUNT_KEY=your_production_service_account_key
# ... other Firebase production keys
```

## 3. Deployment Steps

### Step 1: Get Live Stripe Keys
1. Go to https://dashboard.stripe.com/
2. Switch to **Live mode** (toggle in top-right)
3. Go to **Developers > API keys**
4. Copy your Live keys:
   - **Publishable key** (pk_live_...) → `VITE_STRIPE_LIVE_PUBLIC_KEY`
   - **Secret key** (sk_live_...) → `STRIPE_LIVE_SECRET_KEY`

### Step 2: Create Live Stripe Products
1. Go to **Products** in Stripe dashboard (Live mode)
2. Create products for Starter ($19.99) and Growth ($49.99)
3. Copy the Price IDs:
   - Starter Price ID → `VITE_STRIPE_LIVE_STARTER_PRICE_ID`
   - Growth Price ID → `VITE_STRIPE_LIVE_GROWTH_PRICE_ID`

### Step 3: Set Up Production Database
1. Create production PostgreSQL database
2. Run migrations: `npm run db:push`
3. Set `DATABASE_URL` secret

### Step 4: Configure Replit Deployment
1. Click **Deploy** button in Replit
2. Choose **Autoscale Deployment** or **Reserved VM**
3. Add all production secrets listed above
4. Set custom domain: `app.ailldoit.com`

### Step 5: Set Up Stripe Webhooks
1. In Stripe dashboard (Live mode), go to **Developers > Webhooks**
2. Add endpoint: `https://app.ailldoit.com/api/stripe/webhook`
3. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy webhook signing secret → `STRIPE_LIVE_WEBHOOK_SECRET`

## 4. Testing Production Deployment

1. **Environment Check**: Verify logs show "LIVE" Stripe mode
2. **Payment Flow**: Test with real credit card (will charge actual money)
3. **Database**: Confirm production database is being used
4. **Webhooks**: Test subscription updates work properly

## 5. Security Considerations

- ✅ Live keys only used on production domain
- ✅ Test keys used for development/staging
- ✅ All secrets encrypted in Replit
- ✅ No hardcoded keys in code
- ✅ Environment-based configuration

## 6. Rollback Plan

If issues occur:
1. Switch DNS back to staging
2. Revert to test keys temporarily
3. Fix issues in development
4. Redeploy to production

## 7. Monitoring

Monitor these in production:
- Stripe webhook delivery
- Database connection health
- User subscription status sync
- Payment processing errors

The system is now ready for production deployment with automatic environment detection!