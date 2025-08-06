import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface PromptBlock {
  id: string;
  title: string;
  prompt: string;
  description: string;
  tags: {
    industry: string[];
    audience: string[];
    platform: string[];
    tone: string[];
    motionType: string[];
    visualVibe: string[];
  };
  previewUrl?: string;
}

interface BriefAnalysis {
  category: string;
  audience: string;
  platform: string;
  tone: string;
  style: string;
  keywords: string[];
}

export class LinkedPromptService {
  private promptBlocks: PromptBlock[] = [
    // Skincare prompts
    {
      id: "skincare-commute-1",
      title: "BTS Train Morning Routine",
      prompt: "A low-angle shot inside a BTS train as a young commuter uses a sleek, bamboo-cased deodorant. Sunlight hits from the train window as leaves animate across the screen spelling 'FRESH MOVE'",
      description: "Urban commuter using eco-friendly product in authentic setting",
      tags: {
        industry: ["skincare", "beauty", "personal-care"],
        audience: ["gen-z", "millennials", "commuters"],
        platform: ["tiktok", "instagram"],
        tone: ["authentic", "natural", "eco-friendly"],
        motionType: ["15s-video", "pov"],
        visualVibe: ["urban", "cinematic", "natural-light"]
      }
    },
    {
      id: "skincare-mirror-2",
      title: "Self-Care Mirror Moment",
      prompt: "Close-up shot of hands applying cream to face in bathroom mirror, soft morning light, steam from hot shower visible, peaceful expression, minimalist white bathroom",
      description: "Intimate self-care routine with natural lighting",
      tags: {
        industry: ["skincare", "beauty", "wellness"],
        audience: ["millennials", "professionals", "women"],
        platform: ["instagram", "facebook"],
        tone: ["luxury", "peaceful", "self-care"],
        motionType: ["static-image", "cinemagraph"],
        visualVibe: ["minimal", "soft-light", "intimate"]
      }
    },
    // Food & Beverage prompts
    {
      id: "food-street-1",
      title: "Street Food Discovery",
      prompt: "Handheld camera following someone through busy Bangkok street market, stopping at food stall, steam rising from fresh cooking, vendor smiling, colorful ingredients",
      description: "Authentic street food experience with cultural immersion",
      tags: {
        industry: ["food", "beverage", "snacks"],
        audience: ["food-lovers", "travelers", "locals"],
        platform: ["tiktok", "instagram"],
        tone: ["authentic", "cultural", "exciting"],
        motionType: ["15s-video", "handheld"],
        visualVibe: ["street", "colorful", "energetic"]
      }
    },
    {
      id: "food-home-2",
      title: "Cozy Home Cooking",
      prompt: "Overhead shot of ingredients being mixed in kitchen, warm lighting, hands kneading dough, steam from oven, family photos on counter, homemade aesthetic",
      description: "Warm, family-oriented cooking scene",
      tags: {
        industry: ["food", "cooking", "family"],
        audience: ["parents", "home-cooks", "families"],
        platform: ["facebook", "instagram"],
        tone: ["warm", "family", "homemade"],
        motionType: ["static-image", "time-lapse"],
        visualVibe: ["cozy", "warm-light", "domestic"]
      }
    },
    // Tech & Gadgets prompts
    {
      id: "tech-office-1",
      title: "Modern Workspace",
      prompt: "Clean desk setup with laptop, smartphone, and new gadget, natural light from window, plants in background, hands interacting with device, professional atmosphere",
      description: "Professional workspace showcasing tech integration",
      tags: {
        industry: ["tech", "gadgets", "productivity"],
        audience: ["professionals", "entrepreneurs", "students"],
        platform: ["linkedin", "instagram"],
        tone: ["professional", "clean", "innovative"],
        motionType: ["static-image", "product-demo"],
        visualVibe: ["minimal", "professional", "bright"]
      }
    },
    // Fashion & Lifestyle prompts
    {
      id: "fashion-street-1",
      title: "Street Style Confidence",
      prompt: "Medium shot of confident person walking through urban street, wearing featured clothing, city backdrop, natural movement, authentic street style, golden hour lighting",
      description: "Urban fashion in authentic street environment",
      tags: {
        industry: ["fashion", "lifestyle", "clothing"],
        audience: ["gen-z", "fashion-conscious", "urban"],
        platform: ["tiktok", "instagram"],
        tone: ["confident", "trendy", "authentic"],
        motionType: ["15s-video", "walking"],
        visualVibe: ["urban", "golden-hour", "street-style"]
      }
    }
  ];

  async analyzeBrief(brief: string, platform: string, language: string): Promise<BriefAnalysis> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          {
            role: "system",
            content: `Analyze this product brief and extract key metadata for semantic matching. 
            Return JSON with: category, audience, platform, tone, style, keywords.
            Categories: skincare, food, tech, fashion, lifestyle, beauty, wellness, gadgets, snacks, beverage
            Audiences: gen-z, millennials, professionals, parents, students, commuters, travelers
            Tones: authentic, luxury, playful, professional, natural, eco-friendly, trendy, warm
            Styles: product-demo, lifestyle, educational, testimonial, behind-scenes`
          },
          {
            role: "user",
            content: `Brief: "${brief}"\nPlatform: ${platform}\nLanguage: ${language}`
          }
        ],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return {
        category: result.category || 'lifestyle',
        audience: result.audience || 'millennials',
        platform: platform.toLowerCase(),
        tone: result.tone || 'authentic',
        style: result.style || 'lifestyle',
        keywords: result.keywords || []
      };
    } catch (error) {
      console.error('Error analyzing brief:', error);
      return {
        category: 'lifestyle',
        audience: 'millennials',
        platform: platform.toLowerCase(),
        tone: 'authentic',
        style: 'lifestyle',
        keywords: []
      };
    }
  }

  findMatchingPrompts(analysis: BriefAnalysis, limit: number = 3): PromptBlock[] {
    const scored = this.promptBlocks.map(prompt => {
      let score = 0;
      
      // Industry/category match (highest weight)
      if (prompt.tags.industry.includes(analysis.category)) score += 10;
      
      // Audience match
      if (prompt.tags.audience.includes(analysis.audience)) score += 8;
      
      // Platform match
      if (prompt.tags.platform.includes(analysis.platform)) score += 6;
      
      // Tone match
      if (prompt.tags.tone.includes(analysis.tone)) score += 5;
      
      // Keywords match
      const keywordMatches = analysis.keywords.filter(keyword => 
        prompt.prompt.toLowerCase().includes(keyword.toLowerCase()) ||
        prompt.tags.industry.some(tag => tag.includes(keyword.toLowerCase())) ||
        prompt.tags.tone.some(tag => tag.includes(keyword.toLowerCase()))
      );
      score += keywordMatches.length * 2;
      
      return { prompt, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.prompt);
  }

  async generateCustomPrompt(analysis: BriefAnalysis, brief: string): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          {
            role: "system",
            content: `Generate a cinematic visual prompt for AI image/video generation based on the campaign brief.
            
            Style: ${analysis.style}
            Tone: ${analysis.tone}
            Platform: ${analysis.platform}
            Audience: ${analysis.audience}
            
            Create a detailed prompt with:
            - Camera angle/shot type
            - Setting/environment
            - Subject interaction
            - Lighting conditions
            - Mood/atmosphere
            
            Keep it under 100 words and focus on visual storytelling.`
          },
          {
            role: "user",
            content: `Campaign brief: "${brief}"`
          }
        ]
      });

      return response.choices[0].message.content || 'A cinematic product showcase in natural lighting';
    } catch (error) {
      console.error('Error generating custom prompt:', error);
      return 'A cinematic product showcase in natural lighting';
    }
  }

  async getLinkSuggestions(brief: string, platform: string, language: string) {
    const analysis = await this.analyzeBrief(brief, platform, language);
    const matchingPrompts = this.findMatchingPrompts(analysis);
    const customPrompt = await this.generateCustomPrompt(analysis, brief);

    return {
      analysis,
      suggestions: {
        matched: matchingPrompts,
        custom: {
          id: 'custom-generated',
          title: 'AI Generated Custom Prompt',
          prompt: customPrompt,
          description: 'Custom prompt generated specifically for your campaign',
          tags: {
            industry: [analysis.category],
            audience: [analysis.audience],
            platform: [analysis.platform],
            tone: [analysis.tone],
            motionType: ['custom'],
            visualVibe: ['custom']
          }
        }
      }
    };
  }
}

export const linkedPromptService = new LinkedPromptService();