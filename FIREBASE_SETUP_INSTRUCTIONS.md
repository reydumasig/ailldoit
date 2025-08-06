# Firebase Authentication Setup Instructions

## The Issue
You're getting "auth/configuration-not-found" error because Firebase Authentication service isn't enabled in your Firebase project console.

## Solution Steps

### 1. Go to Firebase Console
Visit: https://console.firebase.google.com/

### 2. Select Your Project
Click on your "ailldoit" project

### 3. Enable Authentication
1. In the left sidebar, click "Authentication"
2. Click "Get started" if you haven't set it up yet
3. Go to the "Sign-in method" tab
4. Enable "Email/Password" provider:
   - Click on "Email/Password"
   - Toggle "Enable" to ON
   - Click "Save"
5. Enable "Google" provider (optional but recommended):
   - Click on "Google"
   - Toggle "Enable" to ON
   - Add your project's support email
   - Click "Save"

### 6. Configure Authorized Domains (CRITICAL for Google OAuth)
1. In Firebase Console, go to Authentication > Settings
2. Click on the "Authorized domains" tab
3. Add these domains:
   - `localhost` (for local development)
   - Your Replit domain (e.g., `your-repl-name.username.repl.co`)
   - Any custom domains you're using
4. Click "Add domain" for each one
5. Save the changes

**Note:** Google OAuth will fail with "unauthorized domain" error if your domain isn't in this list.

### 4. Verify Settings
- Make sure "Email/Password" shows as "Enabled"
- Your authentication should now work

### 7. Test Again
After enabling authentication in the Firebase console, try registering again with:
- Email: test@ailldoit.com
- Password: test123456

## Common Issues

### "Unauthorized domain" Error for Google OAuth
- **Cause:** Your domain isn't added to Firebase authorized domains list
- **Fix:** Add your domain to Authentication > Settings > Authorized domains
- **Required domains:**
  - `localhost` (local development)
  - Your Replit URL (e.g., `your-repl.username.repl.co`)
  - Production domain if deployed

### Other Issues
- If you still get errors, make sure your Firebase project billing is enabled (Authentication requires Blaze plan for production)
- Verify that your project ID in environment variables matches your Firebase console project
- Check that all Firebase environment variables are correctly set in your Replit secrets

The error happens because Firebase Authentication API endpoints don't exist until you enable the service in the console.