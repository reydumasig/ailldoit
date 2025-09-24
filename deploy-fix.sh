#!/bin/bash

# Deploy the Vite fix to Cloud Run STAGING
echo "🔧 Deploying Vite fix to Cloud Run STAGING..."

# Check if gcloud is available
if ! command -v gcloud &> /dev/null; then
    echo "❌ Google Cloud CLI not found. Please install it first."
    echo "   Visit: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get project ID
read -p "Enter your Google Cloud Project ID: " PROJECT_ID
gcloud config set project $PROJECT_ID

echo "📦 Building application..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix the build errors first."
    exit 1
fi

echo "✅ Build completed successfully"

# Deploy to Cloud Run STAGING
echo "🚀 Deploying to Cloud Run STAGING..."
gcloud run deploy ailldoit-staging \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --timeout 300 \
  --memory 2Gi \
  --cpu 1 \
  --max-instances 5 \
  --set-env-vars NODE_ENV=staging,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID

echo ""
echo "🎉 STAGING deployment completed!"
echo "Your staging app should now be running without the Vite import error."
echo ""
echo "📋 Next steps:"
echo "1. Test your staging environment"
echo "2. When ready, deploy to production with:"
echo "   gcloud run deploy ailldoit-production --source . --platform managed --region us-central1 --allow-unauthenticated --port 8080 --timeout 300 --memory 2Gi --cpu 1 --max-instances 5 --set-env-vars NODE_ENV=production,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID"
