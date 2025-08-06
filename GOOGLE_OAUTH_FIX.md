# Google OAuth "Unauthorized Domain" Fix

## Quick Fix Steps

### 1. Firebase Console Setup
1. Go to https://console.firebase.google.com/
2. Select your project
3. Navigate to **Authentication > Settings**
4. Click on **Authorized domains** tab
5. Add these domains:
   ```
   localhost
   127.0.0.1
   d653493a-4e36-452c-a9f2-86dbf84ba0b6-00-2spebdpdnxh9l.janeway.replit.dev
   ```
   **Note:** The Replit domain above is your current domain. Copy it exactly as shown.
6. Click **Add domain** for each one
7. Save changes

### 2. Check Your Current Domain
- In your browser, check the exact URL you're using
- Make sure it matches one of the authorized domains
- Common formats:
  - Local: `http://localhost:5000` or `http://127.0.0.1:5000`
  - Replit: `https://your-repl-name.username.repl.co`

### 3. Environment Variables Check
Make sure these are set in your Replit secrets:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

### 4. Test Process
1. Try email/password login first to verify Firebase is working
2. Then try Google OAuth
3. Check browser console for specific error messages

## Common Error Messages

- **"auth/unauthorized-domain"**: Domain not in authorized list
- **"auth/configuration-not-found"**: Authentication not enabled in Firebase console
- **"auth/api-key-not-valid"**: Wrong API key in environment variables

## Still Not Working?

If Google OAuth still fails:
1. Check that Google provider is enabled in Firebase Console
2. Verify your support email is set in Google provider settings
3. Make sure your Firebase project has billing enabled (required for Google OAuth)
4. Clear browser cache and cookies
5. Try in an incognito/private browser window