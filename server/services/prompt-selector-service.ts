import { GoogleGenAI } from "@google/genai";
import { OpenAI } from "openai";

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

export interface PromptTemplate {
  id: string;
  title: string;
  category: string;
  prompt: string;
  tags: string[];
  shotType: string;
  tone: string;
  subject: string;
  style: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  previewImage?: string;
  usageCount: number;
  rating: number;
}

export interface GuidedPromptOptions {
  sceneType: string;
  subject: string;
  tone: string;
  cameraView: string;
  style: string;
  lighting: string;
  mood: string;
}

export interface InspirationItem {
  id: string;
  prompt: string;
  generatedContent: {
    imageUrl?: string;
    description: string;
  };
  remixCount: number;
  category: string;
  tags: string[];
}

class PromptSelectorService {
  private promptCategories = [
    'Nature & Landscapes',
    'Urban & Architecture', 
    'Fantasy & Surreal',
    'Portrait & Characters',
    'Abstract & Artistic',
    'Product & Commercial',
    'Emotional & Dramatic',
    'Minimalist & Clean',
    'Vintage & Retro',
    'Futuristic & Sci-Fi'
  ];

  private predefinedPrompts: PromptTemplate[] = [
    {
      id: 'nature-1',
      title: 'Cinematic Forest Scene',
      category: 'Nature & Landscapes',
      prompt: 'Wide cinematic shot deep within a tranquil bamboo forest in Japan, with soft rays of sunlight filtering through dense green stalks. Suddenly, bamboo shoots begin to sway, twist, and rise, moving as if alive—their tips weaving, bending, and dancing to create a beautiful rhythmic spectacle.',
      tags: ['cinematic', 'forest', 'bamboo', 'japan', 'nature'],
      shotType: 'Wide Shot',
      tone: 'Tranquil',
      subject: 'Forest',
      style: 'Cinematic',
      difficulty: 'intermediate',
      usageCount: 234,
      rating: 4.8
    },
    {
      id: 'urban-1', 
      title: 'Sacred Architecture Transformation',
      category: 'Urban & Architecture',
      prompt: 'POV from above an ethereal wooden structure emerging slowly from the mist in the distance, through a meditative journey. The elements breathing with presence. The pagoda pulses gently, as structure never static, constantly breathing with the pulse. Style: Sacred kinetic surrealism, warm natural wood textures, mountain wind and creaking wood ambience.',
      tags: ['architecture', 'sacred', 'wooden', 'ethereal', 'transformation'],
      shotType: 'Aerial View',
      tone: 'Mystical',
      subject: 'Architecture',
      style: 'Surreal',
      difficulty: 'advanced',
      usageCount: 189,
      rating: 4.9
    },
    {
      id: 'product-1',
      title: 'Premium Product Showcase',
      category: 'Product & Commercial',
      prompt: 'Elegant product photography of a premium skincare bottle on marble surface with soft natural lighting, minimalist composition, luxury aesthetic, clean background, professional commercial style.',
      tags: ['product', 'luxury', 'skincare', 'commercial', 'minimalist'],
      shotType: 'Close-up',
      tone: 'Sophisticated',
      subject: 'Product',
      style: 'Commercial',
      difficulty: 'beginner',
      usageCount: 567,
      rating: 4.6
    },
    {
      id: 'portrait-1',
      title: 'Emotional Character Study',
      category: 'Portrait & Characters',
      prompt: 'Intimate close-up portrait of a young artist in their studio, golden hour lighting streaming through large windows, paint-stained hands creating art, expression of deep concentration and passion, warm earth tones.',
      tags: ['portrait', 'artist', 'emotional', 'golden hour', 'intimate'],
      shotType: 'Close-up',
      tone: 'Emotional',
      subject: 'Human',
      style: 'Documentary',
      difficulty: 'intermediate',
      usageCount: 345,
      rating: 4.7
    },
    {
      id: 'abstract-1',
      title: 'Flowing Liquid Art',
      category: 'Abstract & Artistic',
      prompt: 'Abstract fluid art composition with metallic copper and deep emerald flowing together, organic shapes morphing and dancing, high-speed photography capturing liquid motion, dramatic lighting against black background.',
      tags: ['abstract', 'fluid', 'metallic', 'motion', 'artistic'],
      shotType: 'Macro',
      tone: 'Dynamic',
      subject: 'Abstract',
      style: 'Artistic',
      difficulty: 'advanced',
      usageCount: 278,
      rating: 4.5
    }
  ];

  private inspirationFeed: InspirationItem[] = [
    {
      id: 'inspiration-1',
      prompt: 'Whimsical coffee shop in a treehouse, morning light filtering through leaves, cozy interior with hanging plants and wooden furniture, steam rising from fresh coffee cups.',
      generatedContent: {
        description: 'A magical treehouse cafe with rustic charm and natural lighting'
      },
      remixCount: 23,
      category: 'Urban & Architecture',
      tags: ['coffee', 'treehouse', 'cozy', 'whimsical']
    },
    {
      id: 'inspiration-2', 
      prompt: 'Surreal underwater city with floating buildings, schools of colorful fish swimming between structures, soft bioluminescent lighting, dreamlike atmosphere.',
      generatedContent: {
        description: 'An ethereal underwater metropolis with organic architecture'
      },
      remixCount: 45,
      category: 'Fantasy & Surreal',
      tags: ['underwater', 'surreal', 'city', 'bioluminescent']
    }
  ];

  /**
   * Get prompt templates by category and filters
   */
  async getPromptTemplates(
    category?: string,
    shotType?: string,
    tone?: string,
    subject?: string,
    difficulty?: string
  ): Promise<PromptTemplate[]> {
    let filtered = [...this.predefinedPrompts];

    if (category && category !== 'all') {
      filtered = filtered.filter(p => p.category === category);
    }
    if (shotType && shotType !== 'all') {
      filtered = filtered.filter(p => p.shotType === shotType);
    }
    if (tone && tone !== 'all') {
      filtered = filtered.filter(p => p.tone === tone);
    }
    if (subject && subject !== 'all') {
      filtered = filtered.filter(p => p.subject === subject);
    }
    if (difficulty && difficulty !== 'all') {
      filtered = filtered.filter(p => p.difficulty === difficulty);
    }

    return filtered.sort((a, b) => b.rating - a.rating);
  }

  /**
   * Get available categories
   */
  getCategories(): string[] {
    return this.promptCategories;
  }

  /**
   * Get filter options
   */
  getFilterOptions() {
    return {
      shotTypes: ['Close-up', 'Wide Shot', 'Aerial View', 'POV', 'Macro', 'Medium Shot'],
      tones: ['Tranquil', 'Mystical', 'Sophisticated', 'Emotional', 'Dynamic', 'Playful', 'Dramatic'],
      subjects: ['Human', 'Animal', 'Architecture', 'Product', 'Nature', 'Abstract', 'Robot'],
      styles: ['Cinematic', 'Documentary', 'Commercial', 'Artistic', 'Surreal', 'Minimalist'],
      difficulties: ['beginner', 'intermediate', 'advanced']
    };
  }

  /**
   * Generate guided prompt from step-by-step choices
   */
  async generateGuidedPrompt(options: GuidedPromptOptions): Promise<string> {
    try {
      const prompt = `Create a detailed, high-quality prompt for AI image generation based on these specifications:

Scene Type: ${options.sceneType}
Subject: ${options.subject}
Tone: ${options.tone}
Camera View: ${options.cameraView}
Style: ${options.style}
Lighting: ${options.lighting}
Mood: ${options.mood}

Generate a compelling, detailed prompt that combines all these elements naturally. The prompt should be descriptive, specific, and optimized for high-quality AI image generation. Focus on visual details, atmosphere, and technical camera specifications.

Return only the prompt text, no additional formatting or explanation.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert prompt engineer specializing in creating high-quality prompts for AI image generation. Focus on vivid descriptions, technical details, and atmospheric elements."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 300,
      });

      return completion.choices[0]?.message?.content || "Unable to generate prompt";
    } catch (error) {
      console.error('Error generating guided prompt:', error);
      return `${options.cameraView} of ${options.subject} in ${options.sceneType}, ${options.tone} mood with ${options.lighting} lighting, ${options.style} style`;
    }
  }

  /**
   * Generate random "Feeling Lucky" prompts
   */
  async generateRandomPrompts(count: number = 3): Promise<PromptTemplate[]> {
    try {
      const randomCategories = this.promptCategories.sort(() => 0.5 - Math.random()).slice(0, count);
      const prompts: PromptTemplate[] = [];

      for (let i = 0; i < count; i++) {
        const category = randomCategories[i];
        const prompt = await this.generateRandomPromptForCategory(category);
        if (prompt) {
          prompts.push(prompt);
        }
      }

      return prompts;
    } catch (error) {
      console.error('Error generating random prompts:', error);
      // Return random selection from predefined prompts as fallback
      return this.predefinedPrompts
        .sort(() => 0.5 - Math.random())
        .slice(0, count);
    }
  }

  /**
   * Generate random prompt for specific category
   */
  private async generateRandomPromptForCategory(category: string): Promise<PromptTemplate | null> {
    try {
      const prompt = `Generate a creative, high-quality prompt for the category "${category}" for AI image generation.

The prompt should be:
- Visually descriptive and detailed
- Unique and creative
- Technically specific (camera angles, lighting, etc.)
- Emotionally engaging
- Optimized for AI image generation

Return JSON format:
{
  "title": "Short descriptive title",
  "prompt": "Detailed prompt text",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "shotType": "camera shot type",
  "tone": "emotional tone",
  "subject": "main subject",
  "style": "artistic style"
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system", 
            content: "You are a creative prompt engineer who generates unique, high-quality prompts for AI image generation."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.9,
        max_tokens: 400,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) return null;

      const parsed = JSON.parse(response);
      
      return {
        id: `random-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: parsed.title,
        category,
        prompt: parsed.prompt,
        tags: parsed.tags || [],
        shotType: parsed.shotType || 'Medium Shot',
        tone: parsed.tone || 'Creative',
        subject: parsed.subject || 'Mixed',
        style: parsed.style || 'Artistic',
        difficulty: 'intermediate' as const,
        usageCount: 0,
        rating: 4.0
      };
    } catch (error) {
      console.error('Error generating random prompt for category:', error);
      return null;
    }
  }

  /**
   * Get inspiration feed items
   */
  getInspirationFeed(): InspirationItem[] {
    return this.inspirationFeed.sort((a, b) => b.remixCount - a.remixCount);
  }

  /**
   * Remix an existing prompt
   */
  async remixPrompt(originalPrompt: string, remixStyle: string = 'creative'): Promise<string> {
    try {
      const prompt = `Take this original prompt and create a creative remix/variation:

Original: "${originalPrompt}"

Remix Style: ${remixStyle}

Create a new prompt that:
- Maintains the core concept but adds fresh elements
- Changes perspective, style, or mood creatively
- Introduces new visual elements or techniques
- Keeps the technical quality high

Return only the remixed prompt text, no additional formatting.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a creative prompt remixer who takes existing prompts and creates fresh, innovative variations while maintaining quality."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 300,
      });

      return completion.choices[0]?.message?.content || originalPrompt;
    } catch (error) {
      console.error('Error remixing prompt:', error);
      return originalPrompt;
    }
  }

  /**
   * Customize existing prompt (replace elements)
   */
  customizePrompt(originalPrompt: string, replacements: Record<string, string>): string {
    let customized = originalPrompt;
    
    Object.entries(replacements).forEach(([from, to]) => {
      const regex = new RegExp(from, 'gi');
      customized = customized.replace(regex, to);
    });

    return customized;
  }

  /**
   * Get guided prompt builder options
   */
  getGuidedBuilderOptions() {
    return {
      sceneTypes: [
        'Jungle', 'City', 'Room', 'Studio', 'Beach', 'Mountain', 'Desert', 
        'Forest', 'Cafe', 'Street', 'Garden', 'Library', 'Workshop'
      ],
      subjects: [
        'Animal', 'Robot', 'Human', 'Product', 'Vehicle', 'Building', 
        'Plant', 'Object', 'Character', 'Landscape', 'Abstract Form'
      ],
      tones: [
        'Surreal', 'Poetic', 'Realistic', 'Dramatic', 'Playful', 'Mysterious',
        'Peaceful', 'Energetic', 'Melancholic', 'Optimistic', 'Dark', 'Bright'
      ],
      cameraViews: [
        'POV', 'Aerial', 'Wide angle', 'Close-up', 'Bird\'s eye', 'Worm\'s eye',
        'Over shoulder', 'Dutch angle', 'Macro', 'Ultra-wide', 'Telephoto'
      ],
      styles: [
        'Cinematic', 'Documentary', 'Portrait', 'Landscape', 'Abstract',
        'Commercial', 'Fine Art', 'Street Photography', 'Minimalist', 'Vintage'
      ],
      lighting: [
        'Golden hour', 'Blue hour', 'Harsh sunlight', 'Soft diffused',
        'Dramatic shadows', 'Neon lights', 'Candlelight', 'Studio lighting',
        'Natural window light', 'Backlit', 'Rim lighting'
      ],
      moods: [
        'Calm', 'Intense', 'Joyful', 'Contemplative', 'Energetic', 'Serene',
        'Mysterious', 'Romantic', 'Adventurous', 'Nostalgic', 'Futuristic'
      ]
    };
  }
}

export const promptSelectorService = new PromptSelectorService();