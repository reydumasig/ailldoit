import { storage } from '../storage';

export class CreditTrackingService {
  // Standard credit costs for different operations
  private static readonly CREDIT_COSTS = {
    textGeneration: 1,
    imageGeneration: 5,
    videoGeneration: 15,
    contentAnalysis: 1,
    campaignGeneration: 8, // Combined cost for full campaign
  };

  static async trackUsage(
    userId: string,
    operationType: keyof typeof CreditTrackingService.CREDIT_COSTS,
    details: {
      campaignId?: number;
      platform?: string;
      language?: string;
      metadata?: any;
    } = {}
  ): Promise<void> {
    try {
      const creditsConsumed = this.CREDIT_COSTS[operationType];

      await storage.createCreditUsage({
        userId,
        actionType: operationType,
        provider: 'ailldoit-ai',
        creditsConsumed,
        campaignId: details.campaignId,
        tokenCount: details.metadata?.tokenCount,
        metadata: {
          platform: details.platform,
          language: details.language,
          ...details.metadata
        },
      });

      console.log(`💳 Tracked ${creditsConsumed} credits for ${operationType} by user ${userId}`);
    } catch (error) {
      console.error('Credit tracking error:', error);
      // Don't throw error to avoid breaking the main operation
    }
  }

  static async checkUserCredits(userId: string): Promise<{
    hasCredits: boolean;
    creditsUsed: number;
    creditsLimit: number;
    usagePercentage: number;
  }> {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const creditsUsed = user.creditsUsed || 0;
      const creditsLimit = user.creditsLimit || 100;
      const usagePercentage = Math.round((creditsUsed / creditsLimit) * 100);
      const hasCredits = creditsUsed < creditsLimit;

      return {
        hasCredits,
        creditsUsed,
        creditsLimit,
        usagePercentage,
      };
    } catch (error) {
      console.error('Credit check error:', error);
      // Return safe defaults if check fails
      return {
        hasCredits: true,
        creditsUsed: 0,
        creditsLimit: 100,
        usagePercentage: 0,
      };
    }
  }

  static async validateUserCanProceed(
    userId: string,
    operationType: keyof typeof CreditTrackingService.CREDIT_COSTS
  ): Promise<boolean> {
    const { hasCredits, creditsUsed, creditsLimit } = await this.checkUserCredits(userId);
    const requiredCredits = this.CREDIT_COSTS[operationType];

    return hasCredits && (creditsUsed + requiredCredits <= creditsLimit);
  }
}