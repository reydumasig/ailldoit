# Google Cloud Run Deployment Guide

This guide covers deploying Ailldoit to Google Cloud Run for staging and production environments.

## Prerequisites

1. **Google Cloud Project**: `ailldoit-6d0e0`
2. **Cloud SQL Instance**: `ailldoit-staging-db` (already configured)
3. **gcloud CLI**: Installed and authenticated
4. **Docker**: Installed locally (for testing)

## Quick Deployment

### Option 1: Using the deployment script (Recommended)

```bash
# Make sure you're in the project root
cd /Users/rdumasig/Documents/Dev/ailldoit

# Set your environment variables (copy from .env file)
export DATABASE_URL="postgresql://postgres:Al00c@4d1!@35.184.33.188:5432/ailldoit?sslmode=disable"
export FIREBASE_PROJECT_ID="your-staging-project-id"
# ... (set all other required environment variables)

# Run the deployment script
./deploy-staging.sh
```

### Option 2: Manual deployment

```bash
# 1. Build and push the image
gcloud builds submit --tag gcr.io/ailldoit-6d0e0/ailldoit-staging .

# 2. Deploy to Cloud Run
gcloud run deploy ailldoit-staging \
  --image gcr.io/ailldoit-6d0e0/ailldoit-staging \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --max-instances 10 \
  --set-env-vars NODE_ENV=production
```

## Environment Variables

The following environment variables need to be set in Cloud Run:

### Required Variables
- `DATABASE_URL` - Your Cloud SQL connection string
- `NODE_ENV` - Set to "production"
- `PORT` - Set to "8080" (Cloud Run standard)

### Firebase Variables (if using Firebase)
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

### AI Services (Optional - will use mock if not provided)
- `OPENAI_API_KEY`
- `REPLICATE_API_TOKEN`

### Other Services
- `STORAGE_PROVIDER`
- `SESSION_SECRET`
- Social media API keys (optional)

## Setting Environment Variables in Cloud Run

### Using gcloud CLI:
```bash
gcloud run services update ailldoit-staging \
  --region us-central1 \
  --set-env-vars KEY1=value1,KEY2=value2
```

### Using Google Cloud Console:
1. Go to Cloud Run in the Google Cloud Console
2. Click on your service
3. Click "Edit & Deploy New Revision"
4. Go to "Variables & Secrets" tab
5. Add your environment variables
6. Click "Deploy"

## Cloud SQL Connection

Your Cloud SQL instance is already configured:
- **Instance**: `ailldoit-staging-db`
- **Connection Name**: `ailldoit-6d0e0:us-central1:ailldoit-staging-db`
- **Public IP**: `35.184.33.188`
- **Database**: `ailldoit`
- **User**: `postgres`

## Monitoring and Logs

### View Logs:
```bash
gcloud logs read --service=ailldoit-staging --limit=50
```

### View in Console:
1. Go to Cloud Run in Google Cloud Console
2. Click on your service
3. Go to "Logs" tab

## Scaling Configuration

Current settings:
- **Memory**: 2GB
- **CPU**: 2 cores
- **Max Instances**: 10
- **Min Instances**: 0 (scales to zero when not in use)

To update scaling:
```bash
gcloud run services update ailldoit-staging \
  --region us-central1 \
  --memory 4Gi \
  --cpu 4 \
  --max-instances 20
```

## Custom Domain (Optional)

To set up a custom domain:
1. Go to Cloud Run service
2. Click "Manage Custom Domains"
3. Add your domain
4. Follow the DNS configuration instructions

## Troubleshooting

### Common Issues:

1. **Port Issues**: Make sure your app listens on the PORT environment variable
2. **Memory Issues**: Increase memory allocation if needed
3. **Database Connection**: Ensure Cloud SQL instance allows connections from Cloud Run
4. **Environment Variables**: Double-check all required variables are set

### Debug Commands:
```bash
# Check service status
gcloud run services describe ailldoit-staging --region us-central1

# View recent logs
gcloud logs read --service=ailldoit-staging --limit=100

# Test locally with Docker
docker build -t ailldoit-staging .
docker run -p 8080:8080 --env-file .env ailldoit-staging
```

## Cost Optimization

- **CPU Allocation**: Only during request processing
- **Memory**: Scales based on usage
- **Requests**: Pay per request (free tier: 2M requests/month)
- **Cloud SQL**: Separate billing for database

## Security

- **HTTPS**: Automatically enabled
- **Authentication**: Configure as needed
- **Environment Variables**: Stored securely in Cloud Run
- **Database**: Use Cloud SQL with private IP for production

## Next Steps

1. **Set up CI/CD**: Use Cloud Build triggers for automatic deployments
2. **Monitoring**: Set up Cloud Monitoring and alerting
3. **Production**: Create a separate production service with different settings
4. **Custom Domain**: Configure your production domain
5. **SSL**: Set up custom SSL certificates if needed
