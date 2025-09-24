#!/bin/bash

# Ailldoit Staging Deployment Script for Google Cloud Run
# Usage: ./deploy-staging.sh

set -e

# Configuration
PROJECT_ID="ailldoit-6d0e0"
SERVICE_NAME="ailldoit-staging"
REGION="us-central1"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo "🚀 Starting Ailldoit Staging Deployment..."

# Check if gcloud is installed and authenticated
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed. Please install it first."
    exit 1
fi

# Set the project
echo "📋 Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "🔧 Enabling required APIs..."
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Build and push the Docker image
echo "🐳 Building and pushing Docker image..."
gcloud builds submit --tag $IMAGE_NAME .

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --max-instances 10 \
  --set-env-vars NODE_ENV=production \
  --set-env-vars DATABASE_URL="$DATABASE_URL" \
  --set-env-vars FIREBASE_PROJECT_ID="$FIREBASE_PROJECT_ID" \
  --set-env-vars FIREBASE_CLIENT_EMAIL="$FIREBASE_CLIENT_EMAIL" \
  --set-env-vars FIREBASE_PRIVATE_KEY="$FIREBASE_PRIVATE_KEY" \
  --set-env-vars FIREBASE_STORAGE_BUCKET="$FIREBASE_STORAGE_BUCKET" \
  --set-env-vars VITE_FIREBASE_API_KEY="$VITE_FIREBASE_API_KEY" \
  --set-env-vars VITE_FIREBASE_AUTH_DOMAIN="$VITE_FIREBASE_AUTH_DOMAIN" \
  --set-env-vars VITE_FIREBASE_PROJECT_ID="$VITE_FIREBASE_PROJECT_ID" \
  --set-env-vars VITE_FIREBASE_STORAGE_BUCKET="$VITE_FIREBASE_STORAGE_BUCKET" \
  --set-env-vars VITE_FIREBASE_MESSAGING_SENDER_ID="$VITE_FIREBASE_MESSAGING_SENDER_ID" \
  --set-env-vars VITE_FIREBASE_APP_ID="$VITE_FIREBASE_APP_ID" \
  --set-env-vars OPENAI_API_KEY="$OPENAI_API_KEY" \
  --set-env-vars REPLICATE_API_TOKEN="$REPLICATE_API_TOKEN" \
  --set-env-vars STORAGE_PROVIDER="$STORAGE_PROVIDER" \
  --set-env-vars SESSION_SECRET="$SESSION_SECRET"

echo "✅ Deployment completed successfully!"
echo "🌐 Your staging app is available at:"
gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)"
