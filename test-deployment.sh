#!/bin/bash

# Test Cloud Run deployment with minimal configuration
echo "🧪 Testing Cloud Run deployment..."

# Check if gcloud is available
if ! command -v gcloud &> /dev/null; then
    echo "❌ Google Cloud CLI not found. Please install it first."
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

# Deploy with minimal configuration
echo "🚀 Deploying to Cloud Run with minimal configuration..."
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
  --set-env-vars NODE_ENV=production,GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID

echo ""
echo "🔍 Checking deployment status..."
sleep 10

# Get the service URL
SERVICE_URL=$(gcloud run services describe ailldoit-staging --region=us-central1 --format="value(status.url)")
echo "Service URL: $SERVICE_URL"

# Test the health endpoint
echo "🏥 Testing health endpoint..."
curl -f "$SERVICE_URL/api/health" || echo "❌ Health check failed"

echo ""
echo "📋 To see detailed logs, run:"
echo "gcloud logs read \"resource.type=cloud_run_revision AND resource.labels.service_name=ailldoit-staging\" --limit=50 --format=\"value(textPayload)\""
