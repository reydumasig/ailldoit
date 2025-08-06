import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { storage } from '../storage';

const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface BriefTemplate {
  id: string;
  title: string;
  prompt: string;
  tags: string[];
  platforms: string[];
  tone: string;
  languagesSupported: string[];
  trendingTopic?: string;
  relevanceScore: number;
  category: string;
}

export interface TrendingTopic {
  topic: string;
  source: string;
  relevance: number;
  keywords: string[];
  sentiment: string;
  platforms: string[];
}

export class BriefTemplateService {
  private predefinedTemplates: BriefTemplate[] = [
    {
      id: 'tech-breakthrough',
      title: 'Tech Breakthrough (Disrupt)',
      prompt: 'Introduce a groundbreaking tech innovation that solves a major daily problem. Start with a relatable frustration, then reveal your solution as the game-changing breakthrough. Focus on the bridge between current struggle and future ease.',
      tags: ['Tech', 'Innovation', 'Problem-Solving'],
      platforms: ['TikTok', 'Instagram'],
      tone: 'Calm, Luxurious',
      languagesSupported: ['Tagalog', 'Bahasa', 'English'],
      category: 'Technology',
      relevanceScore: 0.9
    },
    {
      id: 'limited-time-flavor',
      title: 'Limited-Time Flavor Discovery',
      prompt: 'Create urgency around a unique, exotic flavor experience that transports taste buds to distant lands. Emphasize the limited availability and authentic cultural connection. Include sensory details and the fear of missing out.',
      tags: ['Food & Beverage', 'Promo', 'Tech', 'Gen Z'],
      platforms: ['Instagram', 'Reels', 'TikTok'],
      tone: 'Bold, Energetic',
      languagesSupported: ['English', 'Tagalog'],
      category: 'Food & Beverage',
      relevanceScore: 0.85
    },
    {
      id: 'unique-best-friend',
      title: 'Unique & Best Friend (Gadget)',
      prompt: 'Present your product as the perfect companion that understands and adapts to personal needs. Focus on the emotional bond and reliability, positioning it as more than just a tool—a trusted friend.',
      tags: ['Product Launch', 'OTC Products'],
      platforms: ['Facebook', 'Instagram'],
      tone: 'Trustworthy, Simple',
      languagesSupported: ['English'],
      category: 'Lifestyle',
      relevanceScore: 0.8
    }
  ];

  /**
   * Get trending topics from various sources
   */
  async getTrendingTopics(platform?: string, language?: string): Promise<TrendingTopic[]> {
    try {
      // Use Gemini to analyze current trends and generate relevant topics
      const prompt = `Generate 10 trending topics for social media content creation in ${language || 'English'} for ${platform || 'all platforms'}. 
      Focus on topics that are currently popular, engaging, and suitable for product marketing.
      
      Return as JSON array with this structure:
      {
        "topics": [
          {
            "topic": "topic name",
            "source": "trend source",
            "relevance": 0.9,
            "keywords": ["keyword1", "keyword2"],
            "sentiment": "positive/neutral/negative",
            "platforms": ["tiktok", "instagram", "facebook"]
          }
        ]
      }`;

      const result = await gemini.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: prompt,
      });
      const response = result.response.text();
      
      const parsed = JSON.parse(response);
      return parsed.topics || [];
    } catch (error) {
      console.error('Error fetching trending topics:', error);
      // Return fallback trending topics
      return [
        {
          topic: 'AI-Powered Productivity Tools',
          source: 'Tech Trends',
          relevance: 0.95,
          keywords: ['AI', 'productivity', 'automation', 'efficiency'],
          sentiment: 'positive',
          platforms: ['tiktok', 'instagram', 'linkedin']
        },
        {
          topic: 'Sustainable Living Hacks',
          source: 'Lifestyle Trends',
          relevance: 0.9,
          keywords: ['sustainability', 'eco-friendly', 'green living', 'environment'],
          sentiment: 'positive',
          platforms: ['instagram', 'tiktok', 'facebook']
        },
        {
          topic: 'Quick Healthy Recipes',
          source: 'Food Trends',
          relevance: 0.85,
          keywords: ['healthy', 'quick', 'recipes', 'nutrition'],
          sentiment: 'positive',
          platforms: ['instagram', 'tiktok', 'youtube']
        }
      ];
    }
  }

  /**
   * Generate personalized brief templates based on user history and trending topics
   */
  async generatePersonalizedTemplates(
    userId: string, 
    platform: string, 
    language: string,
    trendingTopics: TrendingTopic[]
  ): Promise<BriefTemplate[]> {
    try {
      // Get user's successful campaigns for personalization
      const userCampaigns = await storage.getCampaigns(userId);
      const successfulCampaigns = userCampaigns.filter(c => c.status === 'published' || c.status === 'active');
      
      // Analyze user preferences
      const userPatterns = this.analyzeUserPatterns(successfulCampaigns);
      
      // Generate AI-powered templates based on trends and user patterns
      const templates: BriefTemplate[] = [];
      
      for (const topic of trendingTopics.slice(0, 5)) {
        const template = await this.generateTemplateFromTrend(topic, platform, language, userPatterns);
        if (template) {
          templates.push(template);
        }
      }
      
      // Add top predefined templates that match user preferences
      const matchingPredefined = this.predefinedTemplates
        .filter(t => 
          t.platforms.includes(platform.toLowerCase()) && 
          t.languagesSupported.includes(language)
        )
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 3);
      
      templates.push(...matchingPredefined);
      
      return templates.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 8);
    } catch (error) {
      console.error('Error generating personalized templates:', error);
      return this.predefinedTemplates.slice(0, 5);
    }
  }

  /**
   * Generate a brief template from a trending topic
   */
  private async generateTemplateFromTrend(
    topic: TrendingTopic, 
    platform: string, 
    language: string,
    userPatterns: any
  ): Promise<BriefTemplate | null> {
    try {
      const prompt = `Create a compelling product brief template based on this trending topic: "${topic.topic}"
      
      Platform: ${platform}
      Language: ${language}
      User preferences: ${JSON.stringify(userPatterns)}
      Topic keywords: ${topic.keywords.join(', ')}
      
      Generate a brief template that:
      1. Leverages the trending topic naturally
      2. Creates urgency and engagement
      3. Fits the platform's content style
      4. Matches the user's previous successful patterns
      
      Return JSON format:
      {
        "title": "Template Title",
        "prompt": "Detailed prompt instruction for product brief",
        "tags": ["tag1", "tag2", "tag3"],
        "tone": "tone description",
        "category": "category name"
      }`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert social media content strategist who creates viral brief templates."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 1000,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) return null;

      const parsed = JSON.parse(response);
      
      return {
        id: `trend-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: parsed.title,
        prompt: parsed.prompt,
        tags: parsed.tags || [],
        platforms: [platform.toLowerCase()],
        tone: parsed.tone || 'Engaging',
        languagesSupported: [language],
        trendingTopic: topic.topic,
        relevanceScore: topic.relevance,
        category: parsed.category || 'Trending'
      };
    } catch (error) {
      console.error('Error generating template from trend:', error);
      return null;
    }
  }

  /**
   * Analyze user's successful campaign patterns
   */
  private analyzeUserPatterns(campaigns: any[]): any {
    if (campaigns.length === 0) {
      return {
        preferredTones: ['engaging', 'friendly'],
        commonTags: ['product'],
        averageLength: 150
      };
    }

    // Analyze successful campaigns to extract patterns
    const allBriefs = campaigns.map(c => c.brief).filter(Boolean);
    const avgLength = allBriefs.reduce((sum, brief) => sum + brief.length, 0) / allBriefs.length;
    
    return {
      preferredTones: ['engaging', 'authentic'],
      commonTags: ['product', 'lifestyle'],
      averageLength: Math.round(avgLength),
      successfulPlatforms: Array.from(new Set(campaigns.map(c => c.platform))),
      preferredLanguages: Array.from(new Set(campaigns.map(c => c.language)))
    };
  }

  /**
   * Get recommended templates for campaign creation
   */
  async getRecommendedTemplates(
    userId: string,
    platform: string,
    language: string
  ): Promise<{
    trending: BriefTemplate[];
    personalized: BriefTemplate[];
    popular: BriefTemplate[];
  }> {
    try {
      // Get trending topics
      const trendingTopics = await this.getTrendingTopics(platform, language);
      
      // Generate personalized templates
      const personalizedTemplates = await this.generatePersonalizedTemplates(
        userId, 
        platform, 
        language, 
        trendingTopics
      );
      
      // Get popular predefined templates
      const popularTemplates = this.predefinedTemplates
        .filter(t => 
          t.platforms.some(p => p.toLowerCase() === platform.toLowerCase()) &&
          t.languagesSupported.includes(language)
        )
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 4);
      
      return {
        trending: personalizedTemplates.filter(t => t.trendingTopic).slice(0, 3),
        personalized: personalizedTemplates.filter(t => !t.trendingTopic).slice(0, 3),
        popular: popularTemplates
      };
    } catch (error) {
      console.error('Error getting recommended templates:', error);
      return {
        trending: [],
        personalized: [],
        popular: this.predefinedTemplates.slice(0, 4)
      };
    }
  }
}

export const briefTemplateService = new BriefTemplateService();