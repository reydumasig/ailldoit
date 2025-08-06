import { storage } from '../storage';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ContentFeatures {
  length: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  keywords: string[];
  hasEmojis: boolean;
  hasHashtags: boolean;
  hasNumbers: boolean;
  hasQuestions: boolean;
  hasCallToAction: boolean;
  structure: string; // 'hook-benefit-cta', 'question-answer', 'story-lesson', etc.
}

export interface PerformanceMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  clickThroughRate: number;
  engagementRate: number;
  conversionRate: number;
}

export class LearningService {
  
  /**
   * Extract features from content text using AI analysis
   */
  async extractContentFeatures(contentText: string, contentType: string): Promise<ContentFeatures> {
    try {
      const prompt = `Analyze this ${contentType} content and extract key features:

Content: "${contentText}"

Analyze and return a JSON object with these exact fields:
{
  "length": number of characters,
  "sentiment": "positive" | "negative" | "neutral",
  "keywords": array of 3-5 important keywords,
  "hasEmojis": boolean,
  "hasHashtags": boolean,
  "hasNumbers": boolean,
  "hasQuestions": boolean,
  "hasCallToAction": boolean,
  "structure": describe the content structure pattern (e.g., "hook-benefit-cta", "question-answer", "story-lesson")
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert content analyst. Extract features from social media content and return valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) throw new Error('No response from AI');

      return JSON.parse(response) as ContentFeatures;
    } catch (error) {
      console.error('Feature extraction failed:', error);
      // Fallback to basic analysis
      return this.basicFeatureExtraction(contentText);
    }
  }

  /**
   * Fallback feature extraction without AI
   */
  private basicFeatureExtraction(contentText: string): ContentFeatures {
    return {
      length: contentText.length,
      sentiment: 'neutral',
      keywords: contentText.toLowerCase().split(' ').slice(0, 5),
      hasEmojis: /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(contentText),
      hasHashtags: contentText.includes('#'),
      hasNumbers: /\d/.test(contentText),
      hasQuestions: contentText.includes('?'),
      hasCallToAction: /\b(click|buy|shop|visit|download|try|get|order)\b/i.test(contentText),
      structure: 'unknown'
    };
  }

  /**
   * Calculate composite performance score (0-100)
   */
  calculatePerformanceScore(metrics: PerformanceMetrics): number {
    const weights = {
      engagement: 0.4,  // (likes + comments + shares) / views
      clickThrough: 0.3,
      conversion: 0.3
    };

    const engagementScore = metrics.views > 0 
      ? Math.min(100, ((metrics.likes + metrics.comments + metrics.shares) / metrics.views) * 100)
      : 0;

    const ctrScore = Math.min(100, metrics.clickThroughRate);
    const conversionScore = Math.min(100, metrics.conversionRate);

    return Math.round(
      engagementScore * weights.engagement +
      ctrScore * weights.clickThrough +
      conversionScore * weights.conversion
    );
  }

  /**
   * Store content performance data and extract learnings
   */
  async recordContentPerformance(
    campaignId: number,
    userId: string,
    platform: string,
    language: string,
    contentType: string,
    contentText: string,
    metrics: PerformanceMetrics
  ): Promise<void> {
    try {
      // Extract content features
      const features = await this.extractContentFeatures(contentText, contentType);
      
      // Calculate performance score
      const performanceScore = this.calculatePerformanceScore(metrics);

      // Store performance data
      await storage.recordContentPerformance({
        campaignId,
        userId,
        platform,
        language,
        contentType,
        contentText,
        contentFeatures: features,
        performanceScore,
        ...metrics
      });

      // If performance is good (>70), extract patterns for learning
      if (performanceScore > 70) {
        await this.extractLearningPatterns(platform, language, contentType, features, performanceScore);
      }

      console.log(`📊 Recorded performance: ${performanceScore}/100 for ${contentType}`);
    } catch (error) {
      console.error('Failed to record content performance:', error);
    }
  }

  /**
   * Extract patterns from high-performing content
   */
  private async extractLearningPatterns(
    platform: string,
    language: string,
    contentType: string,
    features: ContentFeatures,
    performanceScore: number
  ): Promise<void> {
    const patterns = [
      {
        patternType: 'structure',
        patternData: { structure: features.structure }
      },
      {
        patternType: 'sentiment',
        patternData: { sentiment: features.sentiment }
      },
      {
        patternType: 'length',
        patternData: { 
          lengthRange: this.getLengthRange(features.length),
          exactLength: features.length
        }
      },
      {
        patternType: 'features',
        patternData: {
          hasEmojis: features.hasEmojis,
          hasHashtags: features.hasHashtags,
          hasQuestions: features.hasQuestions,
          hasCallToAction: features.hasCallToAction
        }
      }
    ];

    for (const pattern of patterns) {
      await storage.upsertLearningPattern(
        platform,
        language,
        contentType,
        pattern.patternType,
        pattern.patternData,
        performanceScore
      );
    }
  }

  /**
   * Get optimized prompts based on learning patterns
   */
  async getOptimizedPrompt(
    platform: string,
    language: string,
    contentType: string,
    brief: string
  ): Promise<{ systemPrompt: string; userPrompt: string }> {
    try {
      // Get high-performing patterns
      const patterns = await storage.getTopLearningPatterns(platform, language, contentType, 5);
      
      if (patterns.length === 0) {
        return this.getBaselinePrompt(platform, language, contentType, brief);
      }

      // Build enhanced prompt based on patterns
      const patternInsights = this.buildPatternInsights(patterns);
      
      const systemPrompt = `You are an expert social media ad creative specialist with advanced knowledge of high-performing content patterns.

Based on analysis of successful ${platform} content in ${language}, these patterns perform exceptionally well:

${patternInsights}

Focus on creating content that incorporates these proven successful elements while maintaining authenticity and relevance to the brief.`;

      const userPrompt = `Create ${contentType} content for ${platform} in ${language}.

Brief: ${brief}

Requirements:
- Apply the successful patterns mentioned in the system prompt
- Ensure the content feels natural and authentic
- Optimize for high engagement and conversions
- Maintain cultural relevance for the target audience

Generate compelling ${contentType} that incorporates the most effective patterns from our successful campaigns.`;

      return { systemPrompt, userPrompt };
    } catch (error) {
      console.error('Failed to get optimized prompt:', error);
      return this.getBaselinePrompt(platform, language, contentType, brief);
    }
  }

  /**
   * Build insights text from learning patterns
   */
  private buildPatternInsights(patterns: any[]): string {
    const insights: string[] = [];

    patterns.forEach(pattern => {
      const data = pattern.patternData;
      const score = pattern.avgPerformanceScore;
      
      switch (pattern.patternType) {
        case 'structure':
          insights.push(`• ${data.structure} structure performs at ${score}/100`);
          break;
        case 'sentiment':
          insights.push(`• ${data.sentiment} sentiment achieves ${score}/100 performance`);
          break;
        case 'length':
          insights.push(`• Content around ${data.exactLength} characters scores ${score}/100`);
          break;
        case 'features':
          const features: string[] = [];
          if (data.hasEmojis) features.push('emojis');
          if (data.hasHashtags) features.push('hashtags');
          if (data.hasQuestions) features.push('questions');
          if (data.hasCallToAction) features.push('call-to-action');
          if (features.length > 0) {
            insights.push(`• Content with ${features.join(', ')} scores ${score}/100`);
          }
          break;
      }
    });

    return insights.join('\n');
  }

  /**
   * Get baseline prompt for new platforms/languages without learning data
   */
  private getBaselinePrompt(platform: string, language: string, contentType: string, brief: string) {
    const systemPrompt = `You are an expert social media ad creative specialist focusing on ${platform} content in ${language}. Generate viral, localized content that resonates with the target audience.`;
    
    const userPrompt = `Create ${contentType} content for ${platform} in ${language}.

Brief: ${brief}

Generate engaging, culturally relevant content optimized for ${platform}'s algorithm and ${language}-speaking audience.`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Get length range for pattern matching
   */
  private getLengthRange(length: number): string {
    if (length < 50) return 'short';
    if (length < 150) return 'medium';
    if (length < 300) return 'long';
    return 'very-long';
  }

  /**
   * Get performance analytics for dashboard
   */
  async getPerformanceAnalytics(userId: string): Promise<any> {
    try {
      return await storage.getPerformanceAnalytics(userId);
    } catch (error) {
      console.error('Failed to get performance analytics:', error);
      return {
        totalContent: 0,
        avgPerformanceScore: 0,
        topPerformingPlatforms: [],
        improvementTrends: []
      };
    }
  }
}

export const learningService = new LearningService();