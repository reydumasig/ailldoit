# Environment Setup Guide

This document outlines the required environment variables for the Ailldoit MVP system architecture implementation.

## Required Environment Variables

### Database Configuration
```bash
DATABASE_URL=postgresql://username:password@localhost:5432/ailldoit_db
```

### Firebase Configuration (Authentication & Storage)
```bash
# Firebase Admin SDK (Server-side)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=your-project.appspot.com

# Firebase Client SDK (Client-side - prefixed with VITE_)
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef123456
```

### AI Services Configuration
```bash
# OpenAI GPT-4 API
OPENAI_API_KEY=sk-your-openai-api-key

# Replicate API (for image generation)
REPLICATE_API_TOKEN=r8_your-replicate-token
```

### Storage Configuration
```bash
# Choose storage provider: 'firebase' or 's3'
STORAGE_PROVIDER=firebase

# AWS S3 Configuration (if using S3)
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=ailldoit-assets
```

### Social Media Publishing APIs
```bash
# Meta (Facebook/Instagram) API
META_ACCESS_TOKEN=your-meta-access-token
META_PAGE_ID=your-facebook-page-id

# TikTok API
TIKTOK_ACCESS_TOKEN=your-tiktok-access-token

# YouTube API
YOUTUBE_ACCESS_TOKEN=your-youtube-access-token
YOUTUBE_API_KEY=your-youtube-api-key
```

## Setup Instructions

### 1. Firebase Setup
1. Create a Firebase project at https://console.firebase.google.com
2. Enable Authentication with Email/Password and Google providers
3. Enable Cloud Storage
4. Generate a service account key for server-side operations
5. Copy the configuration values to your environment variables

### 2. OpenAI Setup
1. Create an account at https://platform.openai.com
2. Generate an API key
3. Ensure you have access to GPT-4 Turbo model

### 3. Replicate Setup
1. Create an account at https://replicate.com
2. Generate an API token
3. Test access to SDXL model for image generation

### 4. Social Media API Setup

#### Meta (Facebook/Instagram)
1. Create a Meta Developer account
2. Create a new app and configure it for Instagram Basic Display and Facebook Login
3. Get access tokens for your pages/accounts
4. Set up webhooks for real-time updates

#### TikTok
1. Apply for TikTok for Developers access
2. Create an app and get approval for content publishing
3. Generate access tokens for your TikTok account

#### YouTube
1. Create a Google Cloud project
2. Enable YouTube Data API v3
3. Create OAuth 2.0 credentials
4. Get access tokens for uploading videos

## Development vs Production

### Development Mode
- Set all API keys except database for full testing
- Missing keys will fall back to mock implementations
- Firebase can be used in demo mode

### Production Mode
- All environment variables are required
- Implement proper secret management
- Use production-grade database with connection pooling
- Enable monitoring and logging

## Security Best Practices

1. **Never commit API keys to version control**
2. **Use different keys for development and production**
3. **Rotate keys regularly**
4. **Implement proper access controls**
5. **Monitor API usage and costs**
6. **Use environment-specific configurations**

## Testing Configuration

For testing purposes, you can use a subset of services:
- Database: Required
- Firebase Auth: Recommended
- OpenAI: Optional (will use mock if missing)
- Replicate: Optional (will use mock if missing)
- Social Media APIs: Optional (will use mock publishing)

This allows for development and testing without requiring all external service accounts.