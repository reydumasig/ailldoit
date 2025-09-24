#!/bin/bash

# Deploy Ailldoit to Google Cloud Run
echo "🚀 Deploying Ailldoit to Google Cloud Run..."

# Check if gcloud is available
if ! command -v gcloud &> /dev/null; then
    echo "❌ Google Cloud CLI not found. Please install it first."
    echo "   Visit: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get project ID
read -p "Enter your Google Cloud Project ID: " PROJECT_ID
gcloud config set project $PROJECT_ID

# Build the application first
echo "📦 Building application..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix the build errors first."
    exit 1
fi

echo "✅ Build completed successfully"

# Deploy to Cloud Run with explicit service name
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy ailldoit-staging \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --timeout 300 \
  --memory 2Gi \
  --cpu 1 \
  --max-instances 10 \
  --set-env-vars NODE_ENV=production,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID \
  --set-secrets DATABASE_URL=DATABASE_URL:latest \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-secrets OPENAI_API_KEY=OPENAI_API_KEY:latest \
  --set-secrets STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest \
  --set-secrets FIREBASE_SERVICE_ACCOUNT_KEY=FIREBASE_SERVICE_ACCOUNT_KEY:latest \
  --set-secrets REPLICATE_API_TOKEN=REPLICATE_API_TOKEN:latest

if [ $? -eq 0 ]; then
    echo "🎉 Deployment completed successfully!"
    echo "Your app is now running on Google Cloud Run!"
    echo "Service URL: https://ailldoit-staging-[hash]-uc.a.run.app"
else
    echo "❌ Deployment failed. Check the logs above for details."
    exit 1
fi
