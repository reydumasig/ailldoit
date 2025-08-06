import { CampaignVariant } from '@shared/schema';

export class ABTestingService {
  // Generate A/B test variants for campaign content
  generateVariants(baseContent: any, count: number = 3): CampaignVariant[] {
    const variants: CampaignVariant[] = [];

    // Original variant
    variants.push({
      id: 'original',
      name: 'Original',
      hook: baseContent.hook,
      caption: baseContent.caption,
      selected: true
    });

    // Generate additional variants with different approaches
    const variantApproaches = [
      { name: 'Emotional', hookPrefix: 'Transform your life: ' },
      { name: 'Question', hookPrefix: 'Ever wondered why ' },
      { name: 'Urgency', hookPrefix: 'Limited time: ' },
      { name: 'Social Proof', hookPrefix: 'Everyone is talking about ' },
      { name: 'Benefit-focused', hookPrefix: 'Get instant results: ' }
    ];

    for (let i = 1; i < count && i < variantApproaches.length + 1; i++) {
      const approach = variantApproaches[i - 1];
      variants.push({
        id: `variant-${i}`,
        name: approach.name,
        hook: `${approach.hookPrefix}${baseContent.hook}`,
        caption: this.modifyCaptionForVariant(baseContent.caption, approach.name),
        selected: false
      });
    }

    return variants;
  }

  // Track A/B test performance
  async trackVariantPerformance(campaignId: number, variantId: string, metrics: {
    impressions?: number;
    clicks?: number;
    conversions?: number;
    engagement_rate?: number;
    ctr?: number;
  }): Promise<void> {
    // In a real implementation, this would store metrics in a database
    // For now, we'll log the performance data
    console.log(`Campaign ${campaignId}, Variant ${variantId} Performance:`, metrics);
    
    // Calculate performance score
    const score = this.calculatePerformanceScore(metrics);
    console.log(`Performance Score: ${score}`);
  }

  // Analyze A/B test results and determine winner
  async analyzeTestResults(campaignId: number, variants: CampaignVariant[]): Promise<{
    winner: CampaignVariant;
    confidence: number;
    recommendation: string;
  }> {
    // Mock implementation - in reality would fetch actual performance data
    const performanceData = await this.getVariantPerformanceData(campaignId, variants);
    
    // Find the best performing variant
    let winner = variants[0];
    let highestScore = 0;

    for (const variant of variants) {
      const performance = performanceData[variant.id];
      const score = this.calculatePerformanceScore(performance);
      
      if (score > highestScore) {
        highestScore = score;
        winner = variant;
      }
    }

    // Calculate statistical confidence
    const confidence = this.calculateStatisticalConfidence(performanceData);
    
    // Generate recommendation
    const recommendation = this.generateTestRecommendation(winner, confidence, highestScore);

    return {
      winner,
      confidence,
      recommendation
    };
  }

  // Get performance insights for variants
  async getVariantInsights(campaignId: number): Promise<any> {
    return {
      totalTests: 1,
      bestPerformingVariant: 'original',
      improvementRate: '15%',
      recommendedActions: [
        'Test more emotional hooks',
        'Experiment with urgency messaging',
        'Try question-based openings'
      ],
      nextTestSuggestions: [
        'Color scheme variations',
        'Call-to-action button text',
        'Image vs video content'
      ]
    };
  }

  private modifyCaptionForVariant(originalCaption: string, variantType: string): string {
    const modifications = {
      'Emotional': originalCaption + ' ❤️ Share your story with us!',
      'Question': originalCaption.replace('.', '?') + ' Let us know your thoughts!',
      'Urgency': originalCaption + ' ⚡ Act now while supplies last!',
      'Social Proof': originalCaption + ' 🔥 Join thousands of satisfied customers!',
      'Benefit-focused': originalCaption + ' ✨ See results in just 7 days!'
    };

    return modifications[variantType as keyof typeof modifications] || originalCaption;
  }

  private calculatePerformanceScore(metrics: any): number {
    const {
      impressions = 0,
      clicks = 0,
      conversions = 0,
      engagement_rate = 0,
      ctr = 0
    } = metrics;

    // Weighted performance score calculation
    const weights = {
      ctr: 0.3,
      engagement_rate: 0.3,
      conversion_rate: 0.4
    };

    const conversion_rate = impressions > 0 ? (conversions / impressions) * 100 : 0;
    
    return (
      ctr * weights.ctr +
      engagement_rate * weights.engagement_rate +
      conversion_rate * weights.conversion_rate
    );
  }

  private async getVariantPerformanceData(campaignId: number, variants: CampaignVariant[]): Promise<any> {
    // Mock performance data - in reality would fetch from analytics APIs
    const mockData: any = {};
    
    variants.forEach(variant => {
      mockData[variant.id] = {
        impressions: Math.floor(Math.random() * 10000) + 1000,
        clicks: Math.floor(Math.random() * 500) + 50,
        conversions: Math.floor(Math.random() * 50) + 5,
        engagement_rate: Math.random() * 10 + 2,
        ctr: Math.random() * 5 + 1
      };
    });

    return mockData;
  }

  private calculateStatisticalConfidence(performanceData: any): number {
    // Simplified confidence calculation
    const sampleSizes = Object.values(performanceData).map((data: any) => data.impressions);
    const avgSampleSize = sampleSizes.reduce((a: number, b: number) => a + b, 0) / sampleSizes.length;
    
    // Higher sample sizes increase confidence
    if (avgSampleSize > 5000) return 95;
    if (avgSampleSize > 2000) return 85;
    if (avgSampleSize > 1000) return 75;
    return 65;
  }

  private generateTestRecommendation(winner: CampaignVariant, confidence: number, score: number): string {
    if (confidence >= 90) {
      return `Strong winner identified! The ${winner.name} variant outperformed others with ${confidence}% confidence. Deploy this variant for best results.`;
    } else if (confidence >= 75) {
      return `Promising results for ${winner.name} variant with ${confidence}% confidence. Consider running the test longer for higher confidence.`;
    } else {
      return `Test results are inconclusive (${confidence}% confidence). Continue testing or try different variant approaches.`;
    }
  }
}

export const abTestingService = new ABTestingService();