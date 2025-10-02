#!/bin/bash

# Ailldoit Staging Deployment Script for Google Cloud Run
# This script deploys the latest built image to the staging service.
# Usage: ./deploy-run.sh

set -e

# Configuration
PROJECT_ID="ailldoit-6d0e0"
SERVICE_NAME="ailldoit-staging"
REGION="us-central1"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}:latest"

echo "🚀 Deploying to Cloud Run..."

# Deploy to Cloud Run, mounting all secrets correctly.
# Note: We use --update-secrets to replace all existing secrets with this list.
# This ensures a clean and predictable configuration.
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_NAME" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --max-instances 10 \
  --update-env-vars NODE_ENV=production \
  --update-secrets="DATABASE_URL=DATABASE_URL:latest" \
  --update-secrets="FIREBASE_PROJECT_ID=FIREBASE_PROJECT_ID:latest" \
  --update-secrets="FIREBASE_CLIENT_EMAIL=FIREBASE_CLIENT_EMAIL:latest" \
  --update-secrets="FIREBASE_PRIVATE_KEY=FIREBASE_PRIVATE_KEY:latest" \
  --update-secrets="FIREBASE_STORAGE_BUCKET=FIREBASE_STORAGE_BUCKET:latest" \
  --update-secrets="STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest" \
  --update-secrets="STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest" \
  --update-secrets="OPENAI_API_KEY=OPENAI_API_KEY:latest" \
  --update-secrets="REPLICATE_API_TOKEN=REPLICATE_API_TOKEN:latest" \
  --update-secrets="STORAGE_PROVIDER=STORAGE_PROVIDER:latest" \
  --update-secrets="SESSION_SECRET=SESSION_SECRET:latest"

echo "✅ Deployment completed successfully!"
echo "🌐 Your staging app is available at:"
gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)"
