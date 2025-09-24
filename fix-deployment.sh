#!/bin/bash

# Fix Ailldoit Cloud Run Deployment
echo "🔧 Fixing Ailldoit Cloud Run Deployment..."

# Check if gcloud is available
if ! command -v gcloud &> /dev/null; then
    echo "❌ Google Cloud CLI not found. Please install it first."
    exit 1
fi

# Get project ID
read -p "Enter your Google Cloud Project ID: " PROJECT_ID
gcloud config set project $PROJECT_ID

echo "📦 Building application with latest fixes..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix the build errors first."
    exit 1
fi

echo "✅ Build completed successfully"

# Deploy with minimal configuration first (no secrets)
echo "🚀 Deploying with minimal configuration..."
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
  --set-env-vars NODE_ENV=production,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID

if [ $? -eq 0 ]; then
    echo "🎉 Basic deployment successful!"
    echo "✅ Container is now running and listening on port 8080"
    echo "🔧 Next step: Add secrets via Google Cloud Console"
    echo ""
    echo "To add secrets, go to:"
    echo "1. Google Cloud Console > Secret Manager"
    echo "2. Create secrets for:"
    echo "   - DATABASE_URL"
    echo "   - GEMINI_API_KEY" 
    echo "   - OPENAI_API_KEY"
    echo "   - STRIPE_SECRET_KEY"
    echo "   - FIREBASE_SERVICE_ACCOUNT_KEY"
    echo "   - REPLICATE_API_TOKEN"
    echo "3. Then update the Cloud Run service to use these secrets"
else
    echo "❌ Deployment failed. Check the logs above for details."
    exit 1
fi
