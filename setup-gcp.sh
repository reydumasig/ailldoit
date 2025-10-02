#!/bin/bash

# Ailldoit - One-Time GCP Setup Script
# This script configures the necessary GCP resources and permissions for deployment.
# It only needs to be run once, or if you change projects/services.
#
# Usage: ./setup-gcp.sh

set -e

# --- Configuration ---
PROJECT_ID="ailldoit-6d0e0"
SERVICE_NAME="ailldoit-staging"
REGION="us-central1"

echo "🚀 Starting one-time GCP setup for Ailldoit..."

# --- Prerequisites ---
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed. Please install it first."
    exit 1
fi

# --- Project and Authentication ---
echo "📋 Setting project to $PROJECT_ID..."
gcloud config set project "$PROJECT_ID"

echo "🔑 Authenticating with gcloud. Please follow the prompts."
gcloud auth login
gcloud auth application-default login

# --- Enable APIs ---
echo "🔧 Enabling required Google Cloud APIs..."
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com

# --- IAM Permissions ---
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
CB_SA_MEMBER="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

echo "🔐 Granting Cloud Build service account the 'Artifact Registry Writer' role..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="$CB_SA_MEMBER" \
  --role="roles/artifactregistry.writer" \
  --condition=None \
  --quiet

echo "🔐 Granting Cloud Build service account the 'Secret Manager Secret Accessor' role..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="$CB_SA_MEMBER" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None \
  --quiet

# --- Artifact Registry ---
echo "📦 Creating Artifact Registry repository '$SERVICE_NAME'..."
gcloud artifacts repositories create "$SERVICE_NAME" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Docker repository for $SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --ignore-existing

echo "✅ GCP setup completed successfully!"
echo "You can now run ./deploy-staging.sh to deploy your application."