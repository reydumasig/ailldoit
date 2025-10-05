#!/bin/bash

# Ailldoit Staging Deployment Script for Google Cloud Run
# This script builds the Docker image using Cloud Build and deploys it to Cloud Run.
# Usage: ./deploy-staging.sh

set -e

# --- Configuration ---
PROJECT_ID="ailldoit-6d0e0"
SERVICE_NAME="ailldoit-staging"
REGION="us-central1"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}"

# --- Prerequisites ---
echo "📋 Checking prerequisites..."
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed. Please run ./setup-gcp.sh first."
    exit 1
fi
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install it."
    exit 1
fi
echo "✅ Prerequisites check passed."

# --- Build and Deploy ---
echo "📋 Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

echo "🧹 Cleaning up old, invalid secret references from Cloud Run service..."
gcloud run services update "$SERVICE_NAME" \
  --region "$REGION" \
  --remove-secrets="META_APP_ID,META_APP_SECRET,META_PUBLISHING_APP_ID,META_PUBLISHING_APP_SECRET" \
  --quiet || echo "✅ No old secrets to remove, or they were already gone. Continuing..."

echo "🐳 Building and pushing Docker image..."
gcloud builds submit --config cloudbuild.yaml --substitutions=_IMAGE_NAME="$IMAGE_NAME" .

echo "🚀 Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_NAME" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --max-instances 10 \
  --update-env-vars NODE_ENV=production,GOOGLE_CLOUD_PROJECT=ailldoit-6d0e0,GOOGLE_CLOUD_LOCATION=us-central1 \
  --update-secrets="\
DATABASE_URL=DATABASE_URL:latest,\
FIREBASE_SERVICE_ACCOUNT_KEY=FIREBASE_SERVICE_ACCOUNT_KEY:latest,\
FIREBASE_PROJECT_ID=FIREBASE_PROJECT_ID:latest,\
FIREBASE_CLIENT_EMAIL=FIREBASE_CLIENT_EMAIL:latest,\
FIREBASE_PRIVATE_KEY=FIREBASE_PRIVATE_KEY:latest,\
FIREBASE_STORAGE_BUCKET=FIREBASE_STORAGE_BUCKET:latest,\
STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,\
STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest,\
OPENAI_API_KEY=OPENAI_API_KEY:latest,\
REPLICATE_API_TOKEN=REPLICATE_API_TOKEN:latest,\
STORAGE_PROVIDER=STORAGE_PROVIDER:latest,\
SESSION_SECRET=SESSION_SECRET:latest,\
GEMINI_API_KEY=GEMINI_API_KEY:latest,\
VERTEX_API_KEY=VERTEX_API_KEY:latest"

echo "✅ Deployment completed successfully!"
echo "🌐 Your staging app is available at:"
gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)"
