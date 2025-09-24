#!/bin/bash

# Debug Cloud Run deployment
echo "🔍 Debugging Cloud Run deployment..."

# Check if gcloud is available
if ! command -v gcloud &> /dev/null; then
    echo "❌ Google Cloud CLI not found. Please install it first."
    exit 1
fi

# Get project ID
read -p "Enter your Google Cloud Project ID: " PROJECT_ID
gcloud config set project $PROJECT_ID

echo "📋 Getting Cloud Run service logs..."
echo "This will show the actual container startup logs:"
echo ""

# Get the latest revision logs
gcloud run revisions list --service=ailldoit-staging --region=us-central1 --limit=1 --format="value(metadata.name)" | head -1 | xargs -I {} gcloud logs read "resource.type=cloud_run_revision AND resource.labels.service_name=ailldoit-staging AND resource.labels.revision_name={}" --limit=50 --format="value(textPayload)" | head -20

echo ""
echo "🔍 If you don't see detailed logs above, try this command manually:"
echo "gcloud logs read \"resource.type=cloud_run_revision AND resource.labels.service_name=ailldoit-staging\" --limit=100 --format=\"value(textPayload)\""
echo ""
echo "Or check the Cloud Console logs at:"
echo "https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_run_revision%22%0Aresource.labels.service_name%3D%22ailldoit-staging%22;timeRange=PT1H?project=$PROJECT_ID"
