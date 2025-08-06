# Production Secrets Setup Guide

## Current Status ✅
Your development secrets are correctly configured:
- STRIPE_SECRET_KEY (sk_test_...)
- VITE_STRIPE_PUBLIC_KEY (pk_test_...)
- STRIPE_GROWTH_PRICE_ID (price_1Rqcm...)
- VITE_STRIPE_GROWTH_PRICE_ID (price_1Rqcm...)
- VITE_STRIPE_STARTER_PRICE_ID (price_1RqcmN...)

## Additional Secrets Needed for Production

**DO NOT REMOVE** your existing test keys. Add these additional live keys:

### 1. Live Stripe Keys (from Stripe Dashboard - Live Mode)
```
STRIPE_LIVE_SECRET_KEY = sk_live_your_actual_live_secret_key
VITE_STRIPE_LIVE_PUBLIC_KEY = pk_live_your_actual_live_public_key
```

### 2. Live Stripe Price IDs (from Live Products in Stripe)
```
VITE_STRIPE_LIVE_STARTER_PRICE_ID = price_live_your_starter_price_id
VITE_STRIPE_LIVE_GROWTH_PRICE_ID = price_live_your_growth_price_id
```

### 3. Live Webhook Secret
```
STRIPE_LIVE_WEBHOOK_SECRET = whsec_live_your_webhook_secret
```

### 4. Domain Configuration
```
REPLIT_DOMAINS = app.ailldoit.com
NODE_ENV = production
```

## How to Get Live Stripe Keys

### Step 1: Switch to Live Mode
1. Go to https://dashboard.stripe.com/
2. Toggle the "Test mode" switch OFF (top-right corner)
3. You're now in Live mode

### Step 2: Get API Keys
1. Go to **Developers > API keys**
2. Copy your **Publishable key** (pk_live_...) → `VITE_STRIPE_LIVE_PUBLIC_KEY`
3. Copy your **Secret key** (sk_live_...) → `STRIPE_LIVE_SECRET_KEY`

### Step 3: Create Live Products
1. Go to **Products** in Stripe dashboard
2. Create "Starter Plan" - $19.99/month
3. Create "Growth Plan" - $49.99/month
4. Copy the Price IDs for each product

### Step 4: Set Up Webhook
1. Go to **Developers > Webhooks**
2. Click **Add endpoint**
3. URL: `https://app.ailldoit.com/api/stripe/webhook`
4. Select events:
   - customer.subscription.created
   - customer.subscription.updated
   - customer.subscription.deleted
   - invoice.payment_succeeded
   - invoice.payment_failed
5. Copy signing secret → `STRIPE_LIVE_WEBHOOK_SECRET`

## Environment Logic

The system automatically detects:
- **Local development**: Uses your current test keys
- **app.ailldoit.com**: Uses the new live keys
- **Other domains**: Uses test keys (safe fallback)

## Security Notes

✅ Test keys stay for development
✅ Live keys only used on production domain  
✅ No hardcoded keys in code
✅ Automatic environment detection

You can safely deploy with both sets of keys!