import { Request, Response, NextFunction } from 'express';
import { admin } from '../config/firebase-admin';
import { storage } from '../storage';

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
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    // Verify Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Get or create user in our database
    let user = await storage.getUserByFirebaseUid(decodedToken.uid);
    console.log('🔍 Found user by Firebase UID:', user?.id, user?.email);
    
    if (!user) {
      // Create user if doesn't exist
      console.log('👤 Creating new user for Firebase UID:', decodedToken.uid);
      user = await storage.upsertUser({
        email: decodedToken.email!,
        firebaseUid: decodedToken.uid,
        firstName: decodedToken.name?.split(' ')[0],
        lastName: decodedToken.name?.split(' ')[1],
        profileImageUrl: decodedToken.picture,
      });
    } else {
      // Update last login
      await storage.updateLastLogin(user.id);
    }

    // Add user to request
    req.user = {
      id: user.id,
      email: user.email,
      firebaseUid: user.firebaseUid!,
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ message: 'Invalid or expired token' });
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