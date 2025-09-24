#!/bin/bash

# Google Cloud Migration Script for Ailldoit
# This script automates the migration from Replit to Google Cloud

set -e

echo "🚀 Starting Google Cloud Migration for Ailldoit"
echo "=============================================="

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Google Cloud CLI is not installed. Please install it first:"
    echo "   curl https://sdk.cloud.google.com | bash"
    echo "   exec -l \$SHELL"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "❌ Please authenticate with Google Cloud first:"
    echo "   gcloud auth login"
    exit 1
fi

# Set project ID
PROJECT_ID="ailldoit-production"
REGION="us-central1"

echo "📋 Setting up project: $PROJECT_ID"

# Create project if it doesn't exist
if ! gcloud projects describe $PROJECT_ID &> /dev/null; then
    echo "📝 Creating new GCP project..."
    gcloud projects create $PROJECT_ID --name="Ailldoit Production"
fi

# Set the project
gcloud config set project $PROJECT_ID

echo "🔧 Enabling required APIs..."
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable monitoring.googleapis.com
gcloud services enable logging.googleapis.com

echo "🗄️ Setting up Cloud SQL..."
# Create Cloud SQL instance
gcloud sql instances create ailldoit-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=$REGION \
  --storage-type=SSD \
  --storage-size=10GB \
  --backup \
  --enable-ip-alias \
  --quiet

# Create database
gcloud sql databases create ailldoit --instance=ailldoit-db --quiet

# Create user
echo "👤 Creating database user..."
DB_PASSWORD=$(openssl rand -base64 32)
gcloud sql users create ailldoit-user \
  --instance=ailldoit-db \
  --password=$DB_PASSWORD \
  --quiet

echo "💾 Setting up Cloud Storage..."
# Create storage bucket
gsutil mb gs://$PROJECT_ID-storage || echo "Bucket already exists"

# Set bucket permissions
gsutil iam ch allUsers:objectViewer gs://$PROJECT_ID-storage

echo "🔐 Setting up Secret Manager..."
# Store environment variables as secrets
echo "Please provide the following values:"

read -p "Enter your current DATABASE_URL: " CURRENT_DB_URL
read -p "Enter your GEMINI_API_KEY: " GEMINI_KEY
read -p "Enter your OPENAI_API_KEY: " OPENAI_KEY
read -p "Enter your STRIPE_SECRET_KEY: " STRIPE_KEY
read -p "Enter your FIREBASE_SERVICE_ACCOUNT_KEY (JSON): " FIREBASE_KEY
read -p "Enter your REPLICATE_API_TOKEN: " REPLICATE_TOKEN

# Create secrets
echo -n "$CURRENT_DB_URL" | gcloud secrets create DATABASE_URL --data-file=- --quiet || echo "Secret already exists"
echo -n "$GEMINI_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=- --quiet || echo "Secret already exists"
echo -n "$OPENAI_KEY" | gcloud secrets create OPENAI_API_KEY --data-file=- --quiet || echo "Secret already exists"
echo -n "$STRIPE_KEY" | gcloud secrets create STRIPE_SECRET_KEY --data-file=- --quiet || echo "Secret already exists"
echo -n "$FIREBASE_KEY" | gcloud secrets create FIREBASE_SERVICE_ACCOUNT_KEY --data-file=- --quiet || echo "Secret already exists"
echo -n "$REPLICATE_TOKEN" | gcloud secrets create REPLICATE_API_TOKEN --data-file=- --quiet || echo "Secret already exists"

echo "🐳 Building and deploying application..."
# Build and deploy
gcloud builds submit --tag gcr.io/$PROJECT_ID/ailldoit-app

# Deploy to Cloud Run
gcloud run deploy ailldoit-app \
  --image gcr.io/$PROJECT_ID/ailldoit-app \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --set-secrets DATABASE_URL=DATABASE_URL:latest \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-secrets OPENAI_API_KEY=OPENAI_API_KEY:latest \
  --set-secrets STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest \
  --set-secrets FIREBASE_SERVICE_ACCOUNT_KEY=FIREBASE_SERVICE_ACCOUNT_KEY:latest \
  --set-secrets REPLICATE_API_TOKEN=REPLICATE_API_TOKEN:latest

echo "🎉 Migration completed successfully!"
echo "=================================="
echo "Your application is now running on Google Cloud!"
echo "Service URL: https://ailldoit-app-$(gcloud config get-value project).uc.r.appspot.com"
echo ""
echo "Next steps:"
echo "1. Test your application"
echo "2. Setup custom domain (optional)"
echo "3. Configure monitoring"
echo "4. Update DNS records"
echo ""
echo "Database connection details:"
echo "Host: $(gcloud sql instances describe ailldoit-db --format='value(ipAddresses[0].ipAddress)')"
echo "Database: ailldoit"
echo "User: ailldoit-user"
echo "Password: $DB_PASSWORD"
echo ""
echo "Save these credentials securely!"
