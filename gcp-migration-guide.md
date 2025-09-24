# Google Cloud Migration Guide

## Prerequisites
- Google Cloud account with $25,000 credits
- Domain name (optional, can use GCP provided domain)
- Current Replit project backup

## Phase 1: GCP Project Setup

### 1. Create GCP Project
```bash
# Install Google Cloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Login and create project
gcloud auth login
gcloud projects create ailldoit-production --name="Ailldoit Production"
gcloud config set project ailldoit-production

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable monitoring.googleapis.com
gcloud services enable logging.googleapis.com
```

### 2. Setup Cloud SQL (PostgreSQL)
```bash
# Create Cloud SQL instance
gcloud sql instances create ailldoit-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --storage-type=SSD \
  --storage-size=10GB \
  --backup \
  --enable-ip-alias

# Create database
gcloud sql databases create ailldoit --instance=ailldoit-db

# Create user
gcloud sql users create ailldoit-user \
  --instance=ailldoit-db \
  --password=YOUR_SECURE_PASSWORD
```

### 3. Setup Cloud Storage
```bash
# Create storage bucket
gsutil mb gs://ailldoit-production-storage

# Set bucket permissions
gsutil iam ch allUsers:objectViewer gs://ailldoit-production-storage
```

### 4. Setup Secret Manager
```bash
# Store environment variables as secrets
echo -n "your-database-url" | gcloud secrets create DATABASE_URL --data-file=-
echo -n "your-gemini-api-key" | gcloud secrets create GEMINI_API_KEY --data-file=-
echo -n "your-openai-api-key" | gcloud secrets create OPENAI_API_KEY --data-file=-
echo -n "your-stripe-secret-key" | gcloud secrets create STRIPE_SECRET_KEY --data-file=-
echo -n "your-firebase-service-account" | gcloud secrets create FIREBASE_SERVICE_ACCOUNT_KEY --data-file=-
```

## Phase 2: Application Preparation

### 1. Create Dockerfile
```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 8080

# Start application
CMD ["npm", "start"]
```

### 2. Create .dockerignore
```
node_modules
npm-debug.log
.git
.gitignore
README.md
.env
.nyc_output
coverage
.vscode
```

### 3. Update package.json for production
```json
{
  "scripts": {
    "start": "NODE_ENV=production node dist/index.js",
    "build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist"
  }
}
```

## Phase 3: Database Migration

### 1. Export from Neon
```bash
# Export current database
pg_dump $DATABASE_URL > ailldoit-backup.sql
```

### 2. Import to Cloud SQL
```bash
# Import to Cloud SQL
gcloud sql import sql ailldoit-db gs://ailldoit-production-storage/ailldoit-backup.sql
```

## Phase 4: Deploy to Cloud Run

### 1. Build and Deploy
```bash
# Build container
gcloud builds submit --tag gcr.io/ailldoit-production/ailldoit-app

# Deploy to Cloud Run
gcloud run deploy ailldoit-app \
  --image gcr.io/ailldoit-production/ailldoit-app \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --set-secrets DATABASE_URL=DATABASE_URL:latest \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-secrets OPENAI_API_KEY=OPENAI_API_KEY:latest \
  --set-secrets STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest \
  --set-secrets FIREBASE_SERVICE_ACCOUNT_KEY=FIREBASE_SERVICE_ACCOUNT_KEY:latest
```

## Phase 5: Custom Domain & SSL

### 1. Setup Custom Domain
```bash
# Map custom domain
gcloud run domain-mappings create \
  --service ailldoit-app \
  --domain yourdomain.com \
  --region us-central1
```

### 2. Configure DNS
Add CNAME record pointing to the Cloud Run service URL.

## Phase 6: Monitoring & Optimization

### 1. Setup Monitoring
```bash
# Enable monitoring
gcloud services enable monitoring.googleapis.com
```

### 2. Setup Logging
```bash
# Enable logging
gcloud services enable logging.googleapis.com
```

## Cost Estimation

### Monthly Costs (Estimated):
- **Cloud Run**: $0-50 (pay per request)
- **Cloud SQL**: $25-100 (depending on usage)
- **Cloud Storage**: $5-20 (depending on storage)
- **Cloud CDN**: $10-50 (depending on traffic)
- **Secret Manager**: $0.06 per secret per month
- **Monitoring**: $0-20 (depending on usage)

**Total Estimated**: $40-240/month (well within your $25,000 credits)

## Migration Checklist

- [ ] Create GCP project
- [ ] Setup Cloud SQL
- [ ] Setup Cloud Storage
- [ ] Setup Secret Manager
- [ ] Create Dockerfile
- [ ] Export database from Neon
- [ ] Import database to Cloud SQL
- [ ] Build and deploy to Cloud Run
- [ ] Test all functionality
- [ ] Setup custom domain
- [ ] Configure monitoring
- [ ] Update DNS records
- [ ] Go live!

## Post-Migration Benefits

1. **Performance**: 3-5x faster loading times
2. **Reliability**: 99.95% uptime SLA
3. **Scalability**: Auto-scales to handle traffic spikes
4. **Security**: Enterprise-grade security
5. **Global Reach**: Deploy to multiple regions
6. **Cost Efficiency**: Pay only for what you use
7. **Monitoring**: Comprehensive logging and monitoring
8. **Backup**: Automated backups and disaster recovery
