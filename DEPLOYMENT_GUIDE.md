# Ailldoit Deployment Guide

## Prerequisites
Your app is ready for deployment with:
- ✅ Production build working (`npm run build` completed)
- ✅ All environment variables configured in workspace secrets
- ✅ Database and AI services working in development

## Step 1: Initiate Deployment

1. **Find the Deploy Button**
   - Look for the "Deploy" button in your Replit workspace (usually in the top toolbar)
   - Click "Deploy" to open the deployment interface

2. **Choose Deployment Type**
   - Select **"Autoscale Deployment"** (recommended for web apps)
   - This automatically scales based on traffic and you only pay when serving requests

## Step 2: Configure Deployment Settings

### Basic Configuration
- **Name**: `ailldoit-production`
- **Run Command**: `npm run start`
- **Machine Type**: Choose "Basic" (can upgrade later if needed)

### Environment Variables
All your workspace secrets should auto-sync to deployment. Verify these are present:

**Required Variables:**
- `DATABASE_URL` - Your PostgreSQL connection
- `FIREBASE_SERVICE_ACCOUNT_KEY` - Firebase admin config
- `GEMINI_API_KEY` - For AI video/image generation
- `VITE_FIREBASE_API_KEY` - Frontend Firebase config
- `VITE_FIREBASE_PROJECT_ID` - Firebase project ID
- `VITE_FIREBASE_AUTH_DOMAIN` - Firebase auth domain
- `VITE_FIREBASE_STORAGE_BUCKET` - Firebase storage
- `VITE_FIREBASE_MESSAGING_SENDER_ID` - Firebase messaging
- `VITE_FIREBASE_APP_ID` - Firebase app ID
- `SESSION_SECRET` - For secure sessions
- `NODE_ENV=production` - Production mode

## Step 3: Deploy

1. **Review Configuration**
   - Double-check all settings
   - Ensure all environment variables are present

2. **Launch Deployment**
   - Click "Deploy" or "Create Deployment"
   - Wait for the build process to complete (usually 2-5 minutes)

3. **Get Deployment URL**
   - Once deployed, you'll get a Replit deployment URL like:
   - `https://ailldoit-production-username.replit.app`

## Step 4: Test Deployment

1. **Verify Basic Functionality**
   - Visit the deployment URL
   - Test user authentication (login/logout)
   - Create a test campaign
   - Verify AI generation works

2. **Check Logs**
   - Monitor deployment logs for any errors
   - Ensure database connections work
   - Verify API endpoints respond correctly

## Step 5: Connect Custom Domain

1. **Add Domain in Deployment Settings**
   - Go to your deployment dashboard
   - Find "Custom Domains" section
   - Add `app.ailldoit.com`

2. **Configure DNS (Required)**
   You need to update your domain DNS settings:
   
   **Option A: CNAME Record (Recommended)**
   ```
   Type: CNAME
   Name: app
   Value: [your-replit-deployment-url]
   TTL: 300
   ```

   **Option B: A Record**
   ```
   Type: A
   Name: app
   Value: [Replit deployment IP]
   TTL: 300
   ```

3. **SSL Certificate**
   - Replit automatically provides SSL certificates
   - May take 10-15 minutes to activate after DNS propagation

## Step 6: Verify Custom Domain

1. **DNS Propagation**
   - Wait 5-15 minutes for DNS changes to propagate
   - Test with: `nslookup app.ailldoit.com`

2. **Test Full Functionality**
   - Visit `https://app.ailldoit.com`
   - Complete full user workflow
   - Verify all features work correctly

## Troubleshooting

### Common Issues:

**401 Authentication Errors**
- Check Firebase environment variables in deployment
- Verify `FIREBASE_SERVICE_ACCOUNT_KEY` is valid JSON

**Database Connection Errors**
- Confirm `DATABASE_URL` is correctly set in deployment
- Check if database allows connections from deployment IP

**Static Assets Not Loading**
- Verify build completed successfully
- Check if `dist/public` contains all assets

**Domain Not Working**
- Verify DNS records are correct
- Check domain propagation with online DNS tools
- Ensure SSL certificate is active

### Rollback Plan
If deployment fails:
1. Keep development environment running
2. Debug issues in deployment logs
3. Update configuration and redeploy
4. Test thoroughly before switching DNS

## Post-Deployment

1. **Monitor Performance**
   - Check deployment metrics in Replit dashboard
   - Monitor response times and error rates

2. **Update Documentation**
   - Document any deployment-specific configurations
   - Update team on new production URL

3. **Backup Strategy**
   - Ensure database backups are configured
   - Document deployment rollback procedures