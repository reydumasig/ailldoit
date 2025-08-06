import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    firebaseUid: string;
    role?: string;
  };
}

export const requireSuperAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUser(req.user.id);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Superadmin access required' });
    }

    // Add user role to request for downstream use
    req.user.role = user.role;
    next();
  } catch (error) {
    console.error('Super admin check error:', error);
    res.status(500).json({ message: 'Failed to verify admin access' });
  }
};

export const requireAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUser(req.user.id);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (!['admin', 'superadmin'].includes(user.role || '')) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    req.user.role = user.role;
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ message: 'Failed to verify admin access' });
  }
};