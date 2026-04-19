import { Request, Response, NextFunction } from 'express';
import { admin } from '../config/firebase-admin';
import { storage } from '../storage';
import { setRequestUser } from '../observability/sentry';
import { identify as posthogIdentify } from '../observability/posthog';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        firebaseUid: string;
      };
    }
  }
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  console.log('🔐 AUTH MIDDLEWARE: Starting authentication for', req.method, req.path);
  
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    console.log('🎫 AUTH MIDDLEWARE: Token present:', !!token, 'Length:', token?.length || 0);

    if (!token) {
      console.log('❌ AUTH MIDDLEWARE: No token provided');
      return res.status(401).json({ message: 'Access token required' });
    }

    // Check if Firebase is configured
    console.log('🔥 AUTH MIDDLEWARE: Firebase Admin apps count:', admin.apps.length);
    if (!admin.apps.length) {
      console.error('❌ AUTH MIDDLEWARE: Firebase Admin not configured');
      return res.status(503).json({ message: 'Authentication service not configured' });
    }

    // Verify Firebase ID token
    console.log('🔍 AUTH MIDDLEWARE: Verifying Firebase ID token...');
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log('✅ AUTH MIDDLEWARE: Token verified for UID:', decodedToken.uid, 'Email:', decodedToken.email);
    
    // Get or create user in our database
    console.log('🗄️ AUTH MIDDLEWARE: Looking up user in database...');
    let user = await storage.getUserByFirebaseUid(decodedToken.uid);
    console.log('🔍 AUTH MIDDLEWARE: Found user by Firebase UID:', user?.id, user?.email);
    
    if (!user) {
      // Create user if doesn't exist
      console.log('👤 AUTH MIDDLEWARE: Creating new user for Firebase UID:', decodedToken.uid);
      user = await storage.upsertUser({
        email: decodedToken.email!,
        firebaseUid: decodedToken.uid,
        firstName: decodedToken.name?.split(' ')[0],
        lastName: decodedToken.name?.split(' ')[1],
        profileImageUrl: decodedToken.picture,
      });
      console.log('✅ AUTH MIDDLEWARE: New user created with ID:', user.id);
    } else {
      // Update last login
      console.log('🕐 AUTH MIDDLEWARE: Updating last login for user:', user.id);
      await storage.updateLastLogin(user.id);
    }

    // Add user to request
    req.user = {
      id: user.id,
      email: user.email,
      firebaseUid: user.firebaseUid!,
    };

    // Tag Sentry's per-request scope with the user so any subsequent
    // exception from this request is attributed. orgId is set later by
    // `resolveOrg` middleware which runs after auth on photo routes —
    // that middleware makes its own setRequestUser call with orgId once
    // it's known.
    setRequestUser({ userId: user.id, email: user.email });
    // Tie this user id to a PostHog profile so the funnel events we
    // subsequently emit land on the same person across sessions. Cheap —
    // noop when POSTHOG_API_KEY isn't set.
    posthogIdentify({ userId: user.id, email: user.email });

    const duration = Date.now() - startTime;
    console.log('✅ AUTH MIDDLEWARE: Authentication completed in', duration, 'ms for user:', user.id);
    next();
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('❌ AUTH MIDDLEWARE: Authentication failed after', duration, 'ms');
    console.error('🔍 AUTH MIDDLEWARE: Error details:', {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack?.split('\n').slice(0, 3).join('\n')
    });
    return res.status(401).json({ 
      message: 'Invalid or expired token',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    // No auth header, continue without user
    return next();
  }
  
  // Auth header present, try to authenticate
  return authenticateToken(req, res, next);
}