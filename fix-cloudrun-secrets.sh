#!/bin/bash
# Fix Cloud Run secrets - remove GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION from secrets

PROJECT_ID="ailldoit-6d0e0"
SERVICE_NAME="ailldoit-staging"
REGION="us-central1"

echo "🧹 Removing GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION from secrets..."
gcloud run services update "$SERVICE_NAME" \
  --region "$REGION" \
  --remove-secrets="GOOGLE_CLOUD_PROJECT,GOOGLE_CLOUD_LOCATION" \
  --quiet || echo "✅ Secrets removed or didn't exist"

echo "✅ Done! Now run ./deploy-feature-staging.sh again"
