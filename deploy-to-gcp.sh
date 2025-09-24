#!/bin/bash

# Deploy Ailldoit to Google Cloud
echo "🚀 Deploying Ailldoit to Google Cloud..."

# Check if gcloud is available
if ! command -v gcloud &> /dev/null; then
    echo "❌ Google Cloud CLI not found. Please install it first."
    echo "   Visit: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get project ID
read -p "Enter your Google Cloud Project ID: " PROJECT_ID
gcloud config set project $PROJECT_ID

# Deploy to Cloud Run
echo "📦 Building and deploying to Cloud Run..."
gcloud run deploy ailldoit-app \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --set-secrets DATABASE_URL=DATABASE_URL:latest \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-secrets OPENAI_API_KEY=OPENAI_API_KEY:latest \
  --set-secrets STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest \
  --set-secrets FIREBASE_SERVICE_ACCOUNT_KEY=FIREBASE_SERVICE_ACCOUNT_KEY:latest \
  --set-secrets REPLICATE_API_TOKEN=REPLICATE_API_TOKEN:latest \
  --set-env-vars GOOGLE_CLOUD_PROJECT_ID=ailldoit-6d0e0

echo "🎉 Deployment completed!"
echo "Your app is now running on Google Cloud!"
