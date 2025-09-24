# Google Cloud Web-Based Migration Guide

Since we're in Replit, we'll use the Google Cloud Console (web interface) for the migration.

## Step 1: Access Google Cloud Console

1. **Go to**: https://console.cloud.google.com
2. **Sign in** with your Google account
3. **Create a new project** or select existing one
4. **Note your Project ID** (you'll need this)

## Step 2: Enable Required APIs

In the Google Cloud Console:

1. **Go to "APIs & Services" > "Library"**
2. **Enable these APIs:**
   - Cloud Run API
   - Cloud SQL Admin API
   - Cloud Storage API
   - Cloud Build API
   - Secret Manager API
   - Cloud Monitoring API
   - Cloud Logging API

## Step 3: Setup Cloud SQL

1. **Go to "SQL" in the left menu**
2. **Click "Create Instance"**
3. **Choose PostgreSQL**
4. **Configure:**
   - Instance ID: `ailldoit-db`
   - Password: Generate a secure password
   - Region: `us-central1`
   - Machine type: `db-f1-micro` (for cost efficiency)
5. **Click "Create"**

## Step 4: Create Database

1. **Go to your SQL instance**
2. **Click "Databases" tab**
3. **Click "Create Database"**
4. **Name**: `ailldoit`
5. **Click "Create"**

## Step 5: Setup Cloud Storage

1. **Go to "Cloud Storage" > "Buckets"**
2. **Click "Create Bucket"**
3. **Configure:**
   - Name: `ailldoit-production-storage`
   - Location: `us-central1`
   - Storage class: `Standard`
4. **Click "Create"**

## Step 6: Setup Secret Manager

1. **Go to "Security" > "Secret Manager"**
2. **Click "Create Secret"**
3. **Create these secrets:**
   - `DATABASE_URL` - Your current Neon database URL
   - `GEMINI_API_KEY` - Your Gemini API key
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `STRIPE_SECRET_KEY` - Your Stripe secret key
   - `FIREBASE_SERVICE_ACCOUNT_KEY` - Your Firebase service account JSON
   - `REPLICATE_API_TOKEN` - Your Replicate API token

## Step 7: Export Database from Neon

1. **Go to your Neon dashboard**
2. **Export your database** as SQL dump
3. **Download the SQL file**

## Step 8: Import to Cloud SQL

1. **Go to your Cloud SQL instance**
2. **Click "Import"**
3. **Upload your SQL dump file**
4. **Select database**: `ailldoit`
5. **Click "Import"**

## Step 9: Deploy to Cloud Run

1. **Go to "Cloud Run"**
2. **Click "Create Service"**
3. **Configure:**
   - Service name: `ailldoit-app`
   - Region: `us-central1`
   - Deploy one revision from a source repository
4. **Connect your GitHub repository** (if you have one)
5. **Or use "Deploy from source"** and upload your code

## Step 10: Configure Environment Variables

In Cloud Run service:

1. **Go to "Edit & Deploy New Revision"**
2. **Click "Variables & Secrets"**
3. **Add environment variables:**
   - `NODE_ENV` = `production`
4. **Add secrets:**
   - `DATABASE_URL` (from Secret Manager)
   - `GEMINI_API_KEY` (from Secret Manager)
   - `OPENAI_API_KEY` (from Secret Manager)
   - `STRIPE_SECRET_KEY` (from Secret Manager)
   - `FIREBASE_SERVICE_ACCOUNT_KEY` (from Secret Manager)
   - `REPLICATE_API_TOKEN` (from Secret Manager)

## Step 11: Deploy

1. **Click "Deploy"**
2. **Wait for deployment to complete**
3. **Note the service URL**

## Step 12: Test Your Application

1. **Visit the Cloud Run service URL**
2. **Test all functionality**
3. **Verify video generation works**
4. **Check database connectivity**

## Step 13: Setup Custom Domain (Optional)

1. **Go to "Cloud Run" > Your Service**
2. **Click "Manage Custom Domains"**
3. **Add your domain**
4. **Update DNS records** as instructed

## Cost Estimation

- **Cloud Run**: $0-50/month (pay per request)
- **Cloud SQL**: $25-100/month (depending on usage)
- **Cloud Storage**: $5-20/month (depending on storage)
- **Secret Manager**: $0.06 per secret per month
- **Total**: $30-170/month (well within your $25,000 credits)

## Benefits After Migration

✅ **3-5x faster performance**
✅ **99.95% uptime SLA**
✅ **Auto-scaling**
✅ **Global CDN**
✅ **Enterprise security**
✅ **Comprehensive monitoring**
✅ **Automatic backups**

## Next Steps

1. **Complete the migration**
2. **Test thoroughly**
3. **Update DNS** (if using custom domain)
4. **Monitor performance**
5. **Enjoy the improved infrastructure!**

---

**Need help with any step? Let me know!**
