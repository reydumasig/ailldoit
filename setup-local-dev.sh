#!/bin/bash

# Local Development Setup Script
echo "🚀 Setting up Ailldoit for local development..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js version 20+ is required. Current version: $(node -v)"
    echo "   Please upgrade Node.js: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ npm $(npm -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Build the application
echo "🔨 Building application..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Application built successfully"

# Create .env.local if it doesn't exist
if [ ! -f .env.local ]; then
    echo "📝 Creating .env.local template..."
    cat > .env.local << 'EOF'
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/ailldoit_dev"

# Google Cloud
GOOGLE_CLOUD_PROJECT_ID="your-project-id"

# Firebase
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'

# AI Services
OPENAI_API_KEY="your-openai-key"
GEMINI_API_KEY="your-gemini-key"
REPLICATE_API_TOKEN="your-replicate-token"

# Stripe
STRIPE_SECRET_KEY="your-stripe-secret-key"
STRIPE_PUBLIC_KEY="your-stripe-public-key"

# Environment
NODE_ENV="development"
PORT=3000
EOF
    echo "✅ Created .env.local template"
    echo "⚠️  Please edit .env.local with your actual values"
else
    echo "✅ .env.local already exists"
fi

# Check if Google Cloud CLI is installed
if command -v gcloud &> /dev/null; then
    echo "✅ Google Cloud CLI detected"
    echo "   Current project: $(gcloud config get-value project 2>/dev/null || echo 'Not set')"
else
    echo "⚠️  Google Cloud CLI not found"
    echo "   Install it from: https://cloud.google.com/sdk/docs/install"
fi

echo ""
echo "🎉 Local development setup completed!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env.local with your actual values"
echo "2. Set up your database (local PostgreSQL or Cloud SQL)"
echo "3. Run: npm run dev"
echo "4. Visit: http://localhost:3000"
echo ""
echo "📚 For detailed instructions, see LOCAL_SETUP_GUIDE.md"
