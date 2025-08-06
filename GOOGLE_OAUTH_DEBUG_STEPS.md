# Google OAuth Debug & Fix Guide

## Immediate Steps to Fix Google OAuth

### Step 1: Add Current Domain to Firebase
Your current domain is: `d653493a-4e36-452c-a9f2-86dbf84ba0b6-00-2spebdpdnxh9l.janeway.replit.dev`

1. Go to https://console.firebase.google.com/
2. Select your project
3. Navigate to **Authentication > Settings > Authorized domains**
4. Click **Add domain**
5. Add this exact domain: `d653493a-4e36-452c-a9f2-86dbf84ba0b6-00-2spebdpdnxh9l.janeway.replit.dev`
6. Also add: `localhost` (for local testing)
7. Save changes

### Step 2: Test Google OAuth
After adding the domain:
1. Try clicking "Continue with Google" on the login page
2. Check browser console for detailed error messages
3. The error should now be resolved

### Step 3: Debug Information
The app now provides enhanced debugging:
- Console logs show current domain and URL
- Detailed error codes for troubleshooting
- Automatic clipboard copy of setup instructions

## How This Was Fixed

### Enhanced Error Handling
- Added domain detection utilities
- Improved error messages with specific domain information
- Console logging for debugging unauthorized domain errors

### Updated Authentication Flow
- Both login and register pages now detect domain issues
- Clear instructions provided when unauthorized domain error occurs
- Automatic domain detection and setup guidance

### Files Updated
- `client/src/lib/domainUtils.ts` - Domain detection utilities
- `client/src/pages/auth/login.tsx` - Enhanced Google OAuth error handling
- `client/src/pages/auth/register.tsx` - Enhanced Google OAuth error handling
- `GOOGLE_OAUTH_FIX.md` - Comprehensive fix guide with your specific domain

## Next Steps After Domain Fix
1. Test Google OAuth functionality
2. Verify both login and registration work
3. Test on both local development and Replit deployment
4. Users should be able to sign in/up with Google successfully

## Still Having Issues?
If Google OAuth still doesn't work after adding the domain:
1. Check Firebase console > Authentication > Sign-in method
2. Make sure Google provider is enabled
3. Verify you have a valid support email set
4. Check that Firebase project has billing enabled (required for Google OAuth)
5. Try clearing browser cache and cookies