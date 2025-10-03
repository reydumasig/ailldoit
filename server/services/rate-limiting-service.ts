import { Request, Response, NextFunction } from 'express';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  message?: string; // Custom error message
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

class RateLimitingService {
  private store: RateLimitStore = {};
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Create a rate limiting middleware
   */
  createRateLimit(config: RateLimitConfig) {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = this.getKey(req);
      const now = Date.now();
      const windowStart = now - config.windowMs;

      // Clean up expired entries for this key
      if (this.store[key] && this.store[key].resetTime < now) {
        delete this.store[key];
      }

      // Initialize or get current count
      if (!this.store[key]) {
        this.store[key] = {
          count: 0,
          resetTime: now + config.windowMs,
        };
      }

      const current = this.store[key];

      // Check if we're in a new window
      if (now > current.resetTime) {
        current.count = 0;
        current.resetTime = now + config.windowMs;
      }

      // Increment count
      current.count++;

      // Check if limit exceeded
      if (current.count > config.maxRequests) {
        const resetTime = new Date(current.resetTime);
        const retryAfter = Math.ceil((current.resetTime - now) / 1000);

        console.warn(`🚫 RATE LIMIT: ${key} exceeded limit (${current.count}/${config.maxRequests})`);
        
        res.status(429).json({
          error: 'Too Many Requests',
          message: config.message || 'Rate limit exceeded. Please try again later.',
          retryAfter,
          resetTime: resetTime.toISOString(),
          limit: config.maxRequests,
          remaining: 0,
        });
        return;
      }

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': config.maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, config.maxRequests - current.count).toString(),
        'X-RateLimit-Reset': new Date(current.resetTime).toISOString(),
      });

      next();
    };
  }

  /**
   * Get a unique key for the request (IP + user ID if authenticated)
   */
  private getKey(req: Request): string {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userId = (req as any).user?.id || 'anonymous';
    return `${ip}:${userId}`;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const keys = Object.keys(this.store);
    let cleaned = 0;

    for (const key of keys) {
      if (this.store[key].resetTime < now) {
        delete this.store[key];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 RATE LIMIT: Cleaned up ${cleaned} expired entries`);
    }
  }

  /**
   * Get current rate limit status for a key
   */
  getStatus(req: Request): {
    limit: number;
    remaining: number;
    resetTime: Date;
    isLimited: boolean;
  } {
    const key = this.getKey(req);
    const now = Date.now();
    const current = this.store[key];

    if (!current || now > current.resetTime) {
      return {
        limit: 0,
        remaining: 0,
        resetTime: new Date(now + 60 * 1000), // Default 1 minute window
        isLimited: false,
      };
    }

    return {
      limit: 0, // Will be set by middleware
      remaining: Math.max(0, 0 - current.count),
      resetTime: new Date(current.resetTime),
      isLimited: false,
    };
  }

  /**
   * Reset rate limit for a specific key (admin function)
   */
  resetLimit(req: Request): boolean {
    const key = this.getKey(req);
    if (this.store[key]) {
      delete this.store[key];
      console.log(`🔄 RATE LIMIT: Reset limit for ${key}`);
      return true;
    }
    return false;
  }

  /**
   * Get all current rate limits (admin function)
   */
  getAllLimits(): { [key: string]: { count: number; resetTime: Date } } {
    const result: { [key: string]: { count: number; resetTime: Date } } = {};
    
    for (const [key, data] of Object.entries(this.store)) {
      result[key] = {
        count: data.count,
        resetTime: new Date(data.resetTime),
      };
    }

    return result;
  }

  /**
   * Cleanup on service shutdown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store = {};
  }
}

// Create singleton instance
export const rateLimitingService = new RateLimitingService();

// Predefined rate limit configurations
export const rateLimits = {
  // AI Generation endpoints - strict limits
  aiGeneration: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5, // 5 requests per minute
    message: 'AI generation rate limit exceeded. Please wait before generating more content.',
  },
  
  // Text generation - more lenient
  textGeneration: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 requests per minute
    message: 'Text generation rate limit exceeded. Please wait before generating more text.',
  },
  
  // Image generation - moderate limits
  imageGeneration: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 3, // 3 requests per minute
    message: 'Image generation rate limit exceeded. Please wait before generating more images.',
  },
  
  // Video generation - strict limits (expensive)
  videoGeneration: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 2, // 2 requests per 5 minutes
    message: 'Video generation rate limit exceeded. Please wait before generating more videos.',
  },
  
  // General API endpoints
  general: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
    message: 'API rate limit exceeded. Please slow down your requests.',
  },
  
  // Authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10, // 10 requests per 15 minutes
    message: 'Authentication rate limit exceeded. Please wait before trying again.',
  },
};

// Export middleware functions
export const aiGenerationRateLimit = rateLimitingService.createRateLimit(rateLimits.aiGeneration);
export const textGenerationRateLimit = rateLimitingService.createRateLimit(rateLimits.textGeneration);
export const imageGenerationRateLimit = rateLimitingService.createRateLimit(rateLimits.imageGeneration);
export const videoGenerationRateLimit = rateLimitingService.createRateLimit(rateLimits.videoGeneration);
export const generalRateLimit = rateLimitingService.createRateLimit(rateLimits.general);
export const authRateLimit = rateLimitingService.createRateLimit(rateLimits.auth);
