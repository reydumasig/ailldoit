#!/bin/bash

# Test script for Cloud Run deployment
# This script tests the application locally before deploying

set -e

echo "🧪 Testing Ailldoit for Cloud Run deployment..."

# Check if required tools are installed
echo "📋 Checking prerequisites..."

if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    exit 1
fi

echo "✅ Prerequisites check passed"

# Test the build process
echo "🔨 Testing build process..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful"
else
    echo "❌ Build failed"
    exit 1
fi

# Test the health endpoint locally
echo "🏥 Testing health endpoint..."
PORT=8080 npm start &
SERVER_PID=$!

# Wait for server to start
sleep 5

# Test health endpoint
if curl -f http://localhost:8080/api/health > /dev/null 2>&1; then
    echo "✅ Health endpoint working"
else
    echo "❌ Health endpoint failed"
    kill $SERVER_PID
    exit 1
fi

# Clean up
kill $SERVER_PID

echo "🎉 All tests passed! Ready for Cloud Run deployment."
echo ""
echo "Next steps:"
echo "1. Set your environment variables:"
echo "   export DATABASE_URL='postgresql://postgres:Al00c@4d1!@35.184.33.188:5432/ailldoit?sslmode=disable'"
echo "   # ... (set other required variables)"
echo ""
echo "2. Deploy to Cloud Run:"
echo "   ./deploy-staging.sh"
