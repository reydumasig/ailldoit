#!/bin/bash

# Ailldoit Feature Branch Staging Deployment Script
# This script deploys the current feature branch to Google Cloud Run staging
# Usage: ./deploy-feature-staging.sh

set -e

# --- Configuration ---
PROJECT_ID="ailldoit-6d0e0"
SERVICE_NAME="ailldoit-staging"
REGION="us-central1"
BRANCH_NAME=$(git branch --show-current)
COMMIT_SHA=$(git rev-parse --short HEAD)
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}-${BRANCH_NAME//\//-}-${COMMIT_SHA}"

# --- Prerequisites ---
echo "📋 Checking prerequisites..."
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed. Please install it first."
    exit 1
fi
echo "✅ Prerequisites check passed."

# --- Verify we're on a feature branch ---
if [[ "$BRANCH_NAME" == "clean-main" ]] || [[ "$BRANCH_NAME" == "main" ]]; then
    echo "⚠️  You're on $BRANCH_NAME. Use deploy-staging.sh for main branch deployments."
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "🌿 Current branch: $BRANCH_NAME"
echo "📝 Commit SHA: $COMMIT_SHA"
echo "🐳 Image name: $IMAGE_NAME"

# --- Set project ---
echo "📋 Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

# --- Build and push Docker image ---
echo "🐳 Building and pushing Docker image from current branch..."
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions=_IMAGE_NAME="$IMAGE_NAME" \
  .

# --- Deploy to Cloud Run ---
echo "🚀 Deploying to Cloud Run staging..."
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
GEMINI_API_KEY=GEMINI_API_KEY:latest"

echo ""
echo "✅ Deployment completed successfully!"
echo "🌐 Your staging app is available at:"
STAGING_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)")
echo "   $STAGING_URL"
echo ""
echo "📝 Branch: $BRANCH_NAME"
echo "🔖 Commit: $COMMIT_SHA"
echo "🐳 Image: $IMAGE_NAME"
echo ""
echo "🧪 Test the long video generation feature:"
echo "   POST $STAGING_URL/api/campaigns/:id/generate-long-video"

