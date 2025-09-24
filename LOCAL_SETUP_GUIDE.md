# 🚀 Local Development Setup Guide

**Complete migration from Replit to local development with Google Cloud deployment**

---

## 📋 Prerequisites

### 1. **Install Required Software**

#### **Node.js & npm**
```bash
# Install Node.js 20+ (recommended: use nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

#### **Google Cloud CLI**
```bash
# macOS (using Homebrew)
brew install google-cloud-sdk

# Linux
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Windows (using Chocolatey)
choco install gcloudsdk

# Or download from: https://cloud.google.com/sdk/docs/install
```

#### **Git**
```bash
# macOS
brew install git

# Linux
sudo apt-get install git

# Windows
# Download from: https://git-scm.com/download/win
```

### 2. **Google Cloud Setup**

```bash
# Login to Google Cloud
gcloud auth login

# Set your project
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

---

## 🏗️ Local Development Setup

### 1. **Clone Repository**
```bash
# Clone your repository locally
git clone https://github.com/YOUR_USERNAME/ailldoit.git
cd ailldoit
```

### 2. **Install Dependencies**
```bash
# Install all dependencies
npm install

# Build the application
npm run build
```

### 3. **Environment Configuration**

Create `.env.local` file:
```bash
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
```

### 4. **Database Setup**

#### **Option A: Local PostgreSQL**
```bash
# Install PostgreSQL
# macOS
brew install postgresql
brew services start postgresql

# Linux
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql

# Create database
createdb ailldoit_dev
```

#### **Option B: Google Cloud SQL (Recommended)**
```bash
# Create Cloud SQL instance
gcloud sql instances create ailldoit-dev \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1

# Create database
gcloud sql databases create ailldoit_dev --instance=ailldoit-dev

# Get connection string
gcloud sql instances describe ailldoit-dev --format="value(connectionName)"
```

### 5. **Run Development Server**
```bash
# Start development server
npm run dev

# Or start production build locally
npm run build
npm start
```

---

## 🚀 Deployment to Google Cloud

### 1. **Staging Deployment**
```bash
# Deploy to staging
./deploy-fix.sh
```

### 2. **Production Deployment**
```bash
# Deploy to production
gcloud run deploy ailldoit-production \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --timeout 300 \
  --memory 2Gi \
  --cpu 1 \
  --max-instances 10 \
  --set-env-vars NODE_ENV=production,GOOGLE_CLOUD_PROJECT_ID=YOUR_PROJECT_ID
```

---

## 🔧 Development Workflow

### **Daily Development**
1. **Start local server**: `npm run dev`
2. **Make changes**: Edit code in your local environment
3. **Test locally**: Visit `http://localhost:3000`
4. **Commit changes**: `git add . && git commit -m "description"`
5. **Push to staging**: `git push origin staging`
6. **Deploy to staging**: `./deploy-fix.sh`

### **Production Release**
1. **Test on staging**: Verify everything works
2. **Merge to main**: `git checkout main && git merge staging`
3. **Deploy to production**: Use production deployment command
4. **Monitor**: Check Cloud Run logs and metrics

---

## 📁 Project Structure

```
ailldoit/
├── client/                 # React frontend
├── server/                 # Node.js backend
├── shared/                 # Shared types and schemas
├── dist/                   # Built application
├── public/                 # Static assets
├── .env.local             # Local environment variables
├── .gitignore             # Git ignore rules
├── package.json           # Dependencies
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript configuration
├── Dockerfile             # Container configuration
├── deploy-fix.sh          # Staging deployment script
└── README.md              # Project documentation
```

---

## 🛠️ Troubleshooting

### **Common Issues**

1. **Port already in use**
   ```bash
   # Kill process on port 3000
   lsof -ti:3000 | xargs kill -9
   ```

2. **Database connection failed**
   ```bash
   # Check if PostgreSQL is running
   brew services list | grep postgresql
   # or
   sudo systemctl status postgresql
   ```

3. **Google Cloud authentication**
   ```bash
   # Re-authenticate
   gcloud auth login
   gcloud auth application-default login
   ```

4. **Build failures**
   ```bash
   # Clear cache and reinstall
   rm -rf node_modules package-lock.json
   npm install
   npm run build
   ```

---

## 📞 Support

- **Google Cloud Documentation**: https://cloud.google.com/docs
- **Node.js Documentation**: https://nodejs.org/docs
- **React Documentation**: https://react.dev
- **Project Issues**: Create GitHub issues for bugs/features

---

## ✅ Migration Checklist

- [ ] Install Node.js 20+
- [ ] Install Google Cloud CLI
- [ ] Clone repository locally
- [ ] Install dependencies (`npm install`)
- [ ] Set up local database
- [ ] Configure environment variables
- [ ] Test local development server
- [ ] Deploy to staging
- [ ] Test staging environment
- [ ] Deploy to production
- [ ] Set up monitoring and alerts

**🎉 Congratulations! You're now running Ailldoit locally with Google Cloud deployment!**
