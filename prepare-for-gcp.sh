#!/bin/bash

# Prepare Ailldoit for Google Cloud Deployment
echo "🚀 Preparing Ailldoit for Google Cloud deployment..."

# Create production environment file
echo "📝 Creating production environment file..."
cat > .env.production << EOF
# Production Environment Variables for Google Cloud
NODE_ENV=production

# Database (will be set via Secret Manager)
DATABASE_URL=\$DATABASE_URL

# AI Service Keys (will be set via Secret Manager)
GEMINI_API_KEY=\$GEMINI_API_KEY
OPENAI_API_KEY=\$OPENAI_API_KEY
REPLICATE_API_TOKEN=\$REPLICATE_API_TOKEN

# Payment Processing (will be set via Secret Manager)
STRIPE_SECRET_KEY=\$STRIPE_SECRET_KEY

# Firebase (will be set via Secret Manager)
FIREBASE_SERVICE_ACCOUNT_KEY=\$FIREBASE_SERVICE_ACCOUNT_KEY

# Public environment variables (can be set directly)
VITE_FIREBASE_API_KEY=AIzaSyBws685hYqlPxIyzirqyFLOZ4G-D2zwKbY
VITE_FIREBASE_AUTH_DOMAIN=ailldoit-6d0e0.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ailldoit-6d0e0
VITE_FIREBASE_STORAGE_BUCKET=ailldoit-6d0e0.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=481184449900
VITE_FIREBASE_APP_ID=1:481184449900:web:627e5e0142defac2d95f49

# Stripe Public Keys
VITE_STRIPE_PUBLIC_KEY=pk_test_51RqcYjPP7rDa2d8UVCKTp959ihQxyQohzziBPRAbFurkFsrNETkWaVvwygo2qQhVEbYAr7zc47jOgJsvugSGoz9T00RdcJL1Rp
VITE_STRIPE_STARTER_PRICE_ID=price_1RqcmNAhpvUrf7JNFoqHHQ7g
VITE_STRIPE_GROWTH_PRICE_ID=price_1RqcmNAhpvUrf7JN2iWuBtPC
EOF

# Create app.yaml for Google Cloud
echo "📝 Creating app.yaml for Google Cloud..."
cat > app.yaml << EOF
runtime: nodejs20
env: flex

automatic_scaling:
  min_num_instances: 1
  max_num_instances: 10
  cool_down_period: 60s
  cpu_utilization:
    target_utilization: 0.6

resources:
  cpu: 1
  memory_gb: 2
  disk_size_gb: 10

env_variables:
  NODE_ENV: production
  VITE_FIREBASE_API_KEY: "AIzaSyBws685hYqlPxIyzirqyFLOZ4G-D2zwKbY"
  VITE_FIREBASE_AUTH_DOMAIN: "ailldoit-6d0e0.firebaseapp.com"
  VITE_FIREBASE_PROJECT_ID: "ailldoit-6d0e0"
  VITE_FIREBASE_STORAGE_BUCKET: "ailldoit-6d0e0.firebasestorage.app"
  VITE_FIREBASE_MESSAGING_SENDER_ID: "481184449900"
  VITE_FIREBASE_APP_ID: "1:481184449900:web:627e5e0142defac2d95f49"
  VITE_STRIPE_PUBLIC_KEY: "pk_test_51RqcYjPP7rDa2d8UVCKTp959ihQxyQohzziBPRAbFurkFsrNETkWaVvwygo2qQhVEbYAr7zc47jOgJsvugSGoz9T00RdcJL1Rp"
  VITE_STRIPE_STARTER_PRICE_ID: "price_1RqcmNAhpvUrf7JNFoqHHQ7g"
  VITE_STRIPE_GROWTH_PRICE_ID: "price_1RqcmNAhpvUrf7JN2iWuBtPC"

beta_settings:
  cloud_sql_instances: "PROJECT_ID:REGION:INSTANCE_NAME"
EOF

# Create deployment script
echo "📝 Creating deployment script..."
cat > deploy-to-gcp.sh << 'EOF'
#!/bin/bash

# Deploy Ailldoit to Google Cloud
echo "🚀 Deploying Ailldoit to Google Cloud..."

# Check if gcloud is available
if ! command -v gcloud &> /dev/null; then
    echo "❌ Google Cloud CLI not found. Please install it first."
    echo "   Visit: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get project ID
read -p "Enter your Google Cloud Project ID: " PROJECT_ID
gcloud config set project $PROJECT_ID

# Deploy to Cloud Run
echo "📦 Building and deploying to Cloud Run..."
gcloud run deploy ailldoit-app \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --set-secrets DATABASE_URL=DATABASE_URL:latest \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --set-secrets OPENAI_API_KEY=OPENAI_API_KEY:latest \
  --set-secrets STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest \
  --set-secrets FIREBASE_SERVICE_ACCOUNT_KEY=FIREBASE_SERVICE_ACCOUNT_KEY:latest \
  --set-secrets REPLICATE_API_TOKEN=REPLICATE_API_TOKEN:latest

echo "🎉 Deployment completed!"
echo "Your app is now running on Google Cloud!"
EOF

chmod +x deploy-to-gcp.sh

# Create database export script
echo "📝 Creating database export script..."
cat > export-database.sh << 'EOF'
#!/bin/bash

# Export database from Neon
echo "📊 Exporting database from Neon..."

# Get database URL
read -p "Enter your Neon DATABASE_URL: " DATABASE_URL

# Export database
pg_dump $DATABASE_URL > ailldoit-backup.sql

echo "✅ Database exported to ailldoit-backup.sql"
echo "📝 You can now import this to Cloud SQL"
EOF

chmod +x export-database.sh

echo "✅ Preparation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Follow the web-migration-guide.md"
echo "2. Run ./export-database.sh to export your database"
echo "3. Deploy using the Google Cloud Console"
echo ""
echo "🎯 Your app is ready for Google Cloud deployment!"
