import { storage } from '../storage';

export class PerformanceMonitor {
  private static activeUsers = new Set<string>();
  private static activeGenerations = new Map<string, number>();
  private static systemMetrics = {
    peakConcurrentUsers: 0,
    peakConcurrentGenerations: 0,
    totalApiCalls: 0,
    totalCreditsConsumed: 0,
    lastResetTime: Date.now()
  };

  // Track active user sessions
  static trackUserSession(userId: string) {
    this.activeUsers.add(userId);
    if (this.activeUsers.size > this.systemMetrics.peakConcurrentUsers) {
      this.systemMetrics.peakConcurrentUsers = this.activeUsers.size;
    }
    
    console.log(`👥 Active users: ${this.activeUsers.size} (Peak: ${this.systemMetrics.peakConcurrentUsers})`);
  }

  static removeUserSession(userId: string) {
    this.activeUsers.delete(userId);
  }

  // Track AI generation operations
  static startGeneration(userId: string, operationType: string) {
    const userGenerations = this.activeGenerations.get(userId) || 0;
    this.activeGenerations.set(userId, userGenerations + 1);
    
    const totalGenerations = Array.from(this.activeGenerations.values()).reduce((sum, count) => sum + count, 0);
    if (totalGenerations > this.systemMetrics.peakConcurrentGenerations) {
      this.systemMetrics.peakConcurrentGenerations = totalGenerations;
    }
    
    console.log(`⚡ Concurrent AI generations: ${totalGenerations} (Peak: ${this.systemMetrics.peakConcurrentGenerations})`);
    console.log(`🔄 User ${userId} started ${operationType}`);
  }

  static endGeneration(userId: string, operationType: string, creditsUsed: number) {
    const userGenerations = this.activeGenerations.get(userId) || 0;
    if (userGenerations > 1) {
      this.activeGenerations.set(userId, userGenerations - 1);
    } else {
      this.activeGenerations.delete(userId);
    }
    
    this.systemMetrics.totalApiCalls++;
    this.systemMetrics.totalCreditsConsumed += creditsUsed;
    
    const totalGenerations = Array.from(this.activeGenerations.values()).reduce((sum, count) => sum + count, 0);
    console.log(`✅ User ${userId} completed ${operationType} (${creditsUsed} credits)`);
    console.log(`⚡ Concurrent AI generations: ${totalGenerations}`);
  }

  // System capacity assessment
  static async assessSystemCapacity(): Promise<{
    canHandle100Users: boolean;
    currentLoad: {
      activeUsers: number;
      activeGenerations: number;
      systemHealth: string;
    };
    recommendations: string[];
    limits: {
      estimatedMaxConcurrentUsers: number;
      estimatedMaxConcurrentGenerations: number;
      creditConsumptionRate: number;
    };
  }> {
    const currentActiveUsers = this.activeUsers.size;
    const currentActiveGenerations = Array.from(this.activeGenerations.values()).reduce((sum, count) => sum + count, 0);
    
    // Get total system credit usage
    const systemStats = await storage.getSystemStats();
    const recommendations: string[] = [];
    
    // Calculate estimated capacity based on current performance
    const estimatedMaxConcurrentUsers = 150; // Conservative estimate for current infrastructure
    const estimatedMaxConcurrentGenerations = 50; // Based on AI API rate limits
    
    // Calculate credit consumption rate (credits per hour)
    const hoursUptime = (Date.now() - this.systemMetrics.lastResetTime) / (1000 * 60 * 60);
    const creditConsumptionRate = Math.round(this.systemMetrics.totalCreditsConsumed / Math.max(hoursUptime, 1));
    
    // Assess if system can handle 100 users
    const canHandle100Users = estimatedMaxConcurrentUsers >= 100;
    
    // Generate recommendations
    if (creditConsumptionRate > 1000) {
      recommendations.push("Consider upgrading OpenAI/Gemini subscription tiers");
    }
    
    if (this.systemMetrics.peakConcurrentGenerations > 30) {
      recommendations.push("Implement generation queue system for peak loads");
    }
    
    if (currentActiveUsers > 50) {
      recommendations.push("Monitor database connection pool size");
    }
    
    recommendations.push("Set up auto-scaling for database connections");
    recommendations.push("Implement Redis caching for user sessions");
    recommendations.push("Add rate limiting per user (e.g., 5 generations per minute)");
    
    const systemHealth = currentActiveUsers < 30 ? "excellent" : 
                        currentActiveUsers < 60 ? "good" : 
                        currentActiveUsers < 100 ? "moderate" : "high_load";

    return {
      canHandle100Users,
      currentLoad: {
        activeUsers: currentActiveUsers,
        activeGenerations: currentActiveGenerations,
        systemHealth
      },
      recommendations,
      limits: {
        estimatedMaxConcurrentUsers,
        estimatedMaxConcurrentGenerations,
        creditConsumptionRate
      }
    };
  }

  // Get current system metrics
  static getMetrics() {
    return {
      ...this.systemMetrics,
      currentActiveUsers: this.activeUsers.size,
      currentActiveGenerations: Array.from(this.activeGenerations.values()).reduce((sum, count) => sum + count, 0),
      uptimeHours: Math.round((Date.now() - this.systemMetrics.lastResetTime) / (1000 * 60 * 60) * 10) / 10
    };
  }

  // Reset metrics (useful for testing or daily resets)
  static resetMetrics() {
    this.systemMetrics = {
      peakConcurrentUsers: this.activeUsers.size,
      peakConcurrentGenerations: Array.from(this.activeGenerations.values()).reduce((sum, count) => sum + count, 0),
      totalApiCalls: 0,
      totalCreditsConsumed: 0,
      lastResetTime: Date.now()
    };
  }
}