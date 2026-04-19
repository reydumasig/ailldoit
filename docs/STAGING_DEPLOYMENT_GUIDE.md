# Staging Deployment Guide - Feature Branch

This guide explains how to deploy the `feature/long-video-veo-3.1` branch (or any feature branch) to Google Cloud Run staging.

## Prerequisites

1. **Google Cloud CLI** installed and authenticated
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

2. **Project Access** - Ensure you have access to project `ailldoit-6d0e0`

3. **Secrets** - All required secrets must exist in Google Secret Manager:
   - `GEMINI_API_KEY` (required for Veo 3.1 features)
   - `DATABASE_URL`
   - `FIREBASE_*` secrets
   - `STRIPE_*` secrets
   - `OPENAI_API_KEY`
   - `REPLICATE_API_TOKEN`
   - And others as listed in `deploy-staging.sh`

## Quick Deployment

### Option 1: Using the Feature Branch Deployment Script (Recommended)

```bash
# Make sure you're on the feature branch
git checkout feature/long-video-veo-3.1

# Run the deployment script
./deploy-feature-staging.sh
```

This script will:
1. ✅ Check prerequisites
2. ✅ Build Docker image from current branch
3. ✅ Push to Artifact Registry
4. ✅ Deploy to Cloud Run staging service
5. ✅ Configure all secrets and environment variables

### Option 2: Manual Deployment

```bash
# 1. Set variables
PROJECT_ID="ailldoit-6d0e0"
SERVICE_NAME="ailldoit-staging"
REGION="us-central1"
BRANCH_NAME=$(git branch --show-current)
COMMIT_SHA=$(git rev-parse --short HEAD)
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/${SERVICE_NAME}/${SERVICE_NAME}-${BRANCH_NAME//\//-}-${COMMIT_SHA}"

# 2. Build and push
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions=_IMAGE_NAME="$IMAGE_NAME" .

# 3. Deploy to Cloud Run
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_NAME" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --max-instances 10 \
  --update-env-vars NODE_ENV=production \
  --update-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,DATABASE_URL=DATABASE_URL:latest,..."
```

## What Gets Deployed

The deployment includes:

### New Features
- ✅ Veo 3.1 Scene Extension
- ✅ Reference Images (Ingredient-to-Video)
- ✅ Frame-locking for continuity
- ✅ Structured script generation
- ✅ Enhanced prompt engineering
- ✅ Sub-second trimming

### Services Updated
- `server/services/video-script-service.ts` (NEW)
- `server/services/gemini-client.ts` (enhanced)
- `server/services/video-processing-service.ts` (enhanced)
- `server/services/firebase-storage-service.ts` (optional for local dev)

## Testing After Deployment

1. **Get the staging URL:**
   ```bash
   gcloud run services describe ailldoit-staging \
     --region us-central1 \
     --format "value(status.url)"
   ```

2. **Test Long Video Generation:**
   ```bash
   # Replace with your campaign ID and auth token
   curl -X POST https://YOUR-STAGING-URL/api/campaigns/:id/generate-long-video \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{"targetDuration": 60, "platform": "instagram"}'
   ```

3. **Check Logs:**
   ```bash
   gcloud run services logs read ailldoit-staging \
     --region us-central1 \
     --limit 50
   ```

## Environment Variables

The staging environment includes:

- `NODE_ENV=production`
- `GOOGLE_CLOUD_PROJECT=ailldoit-6d0e0`
- `GOOGLE_CLOUD_LOCATION=us-central1`
- All secrets from Secret Manager (including `GEMINI_API_KEY`)

## Important Notes

1. **GEMINI_API_KEY Required**: The Veo 3.1 features require `GEMINI_API_KEY` to be set in Secret Manager
2. **Files API**: Scene Extension requires files to be uploaded to Gemini Files API (handled automatically)
3. **FFmpeg**: Video stitching uses FFmpeg (included in Docker image)
4. **Memory**: Staging uses 2Gi memory and 2 CPU (sufficient for video processing)

## Troubleshooting

### Build Fails
- Check that all secrets exist in Secret Manager
- Verify `cloudbuild.yaml` is correct
- Check Cloud Build logs: `gcloud builds list --limit=5`

### Deployment Fails
- Verify service name: `ailldoit-staging`
- Check IAM permissions
- Review Cloud Run logs

### Video Generation Fails
- Verify `GEMINI_API_KEY` is set correctly
- Check Cloud Run logs for errors
- Ensure Firebase Storage is configured (or using local fallback)

## Rolling Back

To roll back to previous version:

```bash
# List previous revisions
gcloud run revisions list --service ailldoit-staging --region us-central1

# Roll back to specific revision
gcloud run services update-traffic ailldoit-staging \
  --to-revisions REVISION_NAME=100 \
  --region us-central1
```

## Next Steps

After successful deployment and testing:
1. ✅ Test long video generation endpoint
2. ✅ Verify frame-to-frame continuity
3. ✅ Check console logs for feature activation
4. ✅ Monitor Cloud Run metrics
5. ✅ Create PR to merge to main branch

