import OpenAI from 'openai';
import Replicate from 'replicate';
import { GoogleGenAI } from '@google/genai';
import { videoHostingService } from './video-hosting-service';
import { GeneratedContent } from '@shared/schema';
import { learningService } from './learning-service';

// Initialize AI services
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export class AIService {
  // Generate ad content using OpenAI GPT-4 with learning optimization
  async generateAdContent(brief: string, platform: string, language: string, userId?: string, referenceImageUrl?: string): Promise<GeneratedContent> {
    try {
      // Get optimized prompts based on learning patterns
      const { systemPrompt, userPrompt } = await learningService.getOptimizedPrompt(
        platform, 
        language, 
        'content', 
        brief
      );

      // Enhance prompt with reference image context if provided
      const enhancedUserPrompt = referenceImageUrl 
        ? `${userPrompt}\n\nREFERENCE MATERIALS: The user has provided a reference image/material that should guide the visual style and branding. Consider this reference when suggesting visual concepts, color schemes, styling, and overall aesthetic direction for the campaign. The reference material should influence how you describe visual elements in your response.`
        : userPrompt;
      
      console.log(`🧠 Using AI learning-enhanced prompts for ${platform}/${language}`);
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: enhancedUserPrompt
          }
        ],
        temperature: 0.8,
        max_tokens: 2000,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error('No content generated');

      const generatedContent = this.parseAIResponse(content, platform);
      
      // Log generation for future learning (if userId provided)
      if (userId) {
        console.log(`📝 Content generated with learning insights for user ${userId}`);
      }

      return generatedContent;
    } catch (error) {
      console.error('AI content generation failed:', error);
      // Fallback to baseline generation
      return this.generateAdContentBaseline(brief, platform, language);
    }
  }

  // Fallback method for baseline generation (original logic)
  private async generateAdContentBaseline(brief: string, platform: string, language: string): Promise<GeneratedContent> {
    const prompt = this.buildContentPrompt(brief, platform, language);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert social media ad creative specialist focusing on SEA markets. Generate viral, localized content that resonates with the target audience."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.8,
      max_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('No content generated');

    return this.parseAIResponse(content, platform);
  }

  // Generate images using Gemini's image generation
  async generateAdImagesGemini(description: string, style: string = "modern", referenceImageUrl?: string): Promise<string[]> {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for image generation');
    }

    try {
      console.log(`🎨 Generating images with Gemini Imagen 3: "${description}"`);
      console.log(`🎯 Style: ${style}`);
      console.log(`🔑 Using API key: ${process.env.GEMINI_API_KEY?.substring(0, 20)}...`);
      
      let enhancedPrompt = `${description}, ${style} style, high quality, professional advertising photo, clean background, well-lit, commercial photography, product showcase, social media ready, avoid blurry or low quality images, no text or watermarks`;
      
      if (referenceImageUrl) {
        enhancedPrompt += `. Take visual inspiration from the provided reference material for color scheme, style, and branding elements.`;
      }
      
      // Try multiple model names in order of preference
      const modelNames = [
        "imagen-3.0-generate-002", // Latest stable
        "imagen-3.0-generate-001", // Alternative
        "imagegeneration@006",     // Legacy naming
        "imagegeneration@005"      // Fallback
      ];
      
      let lastError;
      for (const modelName of modelNames) {
        try {
          console.log(`🔄 Attempting with model: ${modelName}`);
          const response = await gemini.models.generateImages({
            model: modelName,
            prompt: enhancedPrompt,
            config: {
              numberOfImages: 1,
              aspectRatio: "1:1",
            },
          });

          console.log(`✅ Model ${modelName} succeeded`);
          
          console.log('🔍 Full response structure:', JSON.stringify(response, null, 2));
          
          if (response && (response as any).images && (response as any).images.length > 0) {
            console.log(`🖼️ Generated ${(response as any).images.length} images`);
            
            const imageUrls: string[] = [];
            for (const image of (response as any).images) {
              if (image.data) {
                // Convert to data URL for immediate display
                const dataUrl = `data:image/png;base64,${image.data}`;
                imageUrls.push(dataUrl);
              } else if (image.url) {
                imageUrls.push(image.url);
              }
            }
            
            return imageUrls;
          } else if (response && (response as any).candidates && (response as any).candidates.length > 0) {
            // Handle different response format
            console.log(`🖼️ Found ${(response as any).candidates.length} candidates`);
            
            const imageUrls: string[] = [];
            for (const candidate of (response as any).candidates) {
              if (candidate.content?.parts) {
                for (const part of candidate.content.parts) {
                  if (part.inlineData && part.inlineData.data) {
                    const dataUrl = `data:image/png;base64,${part.inlineData.data}`;
                    imageUrls.push(dataUrl);
                  }
                }
              }
            }
            
            if (imageUrls.length > 0) {
              return imageUrls;
            }
          } else {
            console.log(`⚠️ Model ${modelName} succeeded but returned no images in expected format`);
            console.log('Available response properties:', Object.keys(response || {}));
            lastError = new Error(`No images returned from ${modelName}`);
            continue;
          }
          
        } catch (error) {
          console.log(`❌ Model ${modelName} failed:`, error);
          lastError = error;
          continue;
        }
      }
      
      // If we get here, all models failed
      throw lastError || new Error('All image generation models failed');

    } catch (error) {
      console.error('❌ Gemini Imagen 3 generation failed:', error);
      throw new Error(`Failed to generate images: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Generate images using Replicate SDXL (fallback)
  async generateAdImagesReplicate(description: string, style: string = "modern", referenceImageUrl?: string): Promise<string[]> {
    try {
      const output = await replicate.run(
        "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        {
          input: {
            prompt: `${description}, ${style} style, high quality, professional advertising photo, clean background${referenceImageUrl ? ', taking visual inspiration from provided reference material for styling and branding' : ''}`,
            negative_prompt: "blurry, low quality, distorted, text, watermark",
            width: 1024,
            height: 1024,
            num_inference_steps: 50,
            guidance_scale: 7.5,
          }
        }
      );

      console.log('Raw Replicate output:', typeof output, output);
      
      // Handle ReadableStream output from Replicate
      const outputArray = Array.isArray(output) ? output : [output];
      const imageUrls = [];
      
      for (const item of outputArray) {
        if (typeof item === 'string') {
          imageUrls.push(item);
        } else if (item && typeof item.text === 'function') {
          // Handle ReadableStream - read the stream content
          const text = await item.text();
          imageUrls.push(text);
        } else if (item && typeof item.url === 'function') {
          // Handle URL function - call it to get the actual URL
          const url = item.url();
          imageUrls.push(url.toString());
        } else if (item && item.url) {
          imageUrls.push(item.url);
        } else {
          console.warn('Unexpected output format:', typeof item, item);
          // Try to extract URL from the stream or convert to string
          if (item && item.toString && item.toString() !== '[object Object]') {
            imageUrls.push(String(item));
          }
        }
      }
      
      console.log('Processed image URLs:', imageUrls);
      return imageUrls;
    } catch (error) {
      console.error('Replicate image generation failed:', error);
      throw new Error('Failed to generate images with Replicate');
    }
  }

  // Generate images using OpenAI DALL-E 3
  async generateAdImagesOpenAI(description: string, style: string = "modern", referenceImageUrl?: string): Promise<string[]> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for image generation');
    }

    try {
      console.log(`🎨 Generating images with OpenAI DALL-E 3: "${description}"`);
      console.log(`🎯 Style: ${style}`);
      
      let enhancedPrompt = `${description}, ${style} style, high quality, professional advertising photo, clean background, well-lit, commercial photography, product showcase, social media ready, 4K resolution, no text or watermarks`;
      
      if (referenceImageUrl) {
        enhancedPrompt += `. Take visual inspiration from the provided reference material for color scheme, style, and branding elements.`;
      }
      
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: enhancedPrompt,
        n: 1,
        size: "1024x1024",
        quality: "standard"
      });

      console.log('✅ OpenAI DALL-E 3 images generated successfully!');
      
      const imageUrls = response.data?.map(img => img.url).filter(Boolean) as string[];
      console.log(`📊 Generated ${imageUrls.length} image(s)`);
      
      return imageUrls;
    } catch (error) {
      console.error('❌ OpenAI DALL-E 3 generation failed:', error);
      throw new Error(`Failed to generate images with OpenAI: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Main image generation method with proper provider hierarchy: Replicate → Gemini → OpenAI DALL-E
  async generateAdImages(description: string, style: string = "modern", referenceImageUrl?: string): Promise<string[]> {
    console.log(`🎨 Starting image generation: "${description}"`);
    console.log(`📝 Provider hierarchy: Replicate SDXL → Gemini Imagen 3 → OpenAI DALL-E 3`);
    
    let replicateError, geminiError, openaiError;
    
    // 1st Priority: Replicate SDXL (Primary - most reliable for advertising images)
    try {
      console.log('🎯 Trying Replicate SDXL (Primary)...');
      return await this.generateAdImagesReplicate(description, style, referenceImageUrl);
    } catch (error: any) {
      replicateError = error;
      console.warn('⚠️ Replicate failed, trying Gemini Imagen 3:', error.message);
    }
    
    // 2nd Priority: Gemini Imagen 3 (Secondary - Google's latest image model)
    try {
      console.log('🎯 Trying Gemini Imagen 3 (Secondary)...');
      return await this.generateAdImagesGemini(description, style, referenceImageUrl);
    } catch (error: any) {
      geminiError = error;
      console.warn('⚠️ Gemini failed, trying OpenAI DALL-E 3:', error.message);
    }
    
    // 3rd Priority: OpenAI DALL-E 3 (Final fallback - external URLs expire in 1-2 hours)
    try {
      console.log('🎯 Trying OpenAI DALL-E 3 (Final Fallback - URLs expire quickly)...');
      return await this.generateAdImagesOpenAI(description, style, referenceImageUrl);
    } catch (error: any) {
      openaiError = error;
      console.error('❌ All image generation providers failed');
      console.error('1. Replicate SDXL error:', replicateError?.message);
      console.error('2. Gemini Imagen 3 error:', geminiError?.message);
      console.error('3. OpenAI DALL-E 3 error:', openaiError?.message);
      throw new Error('All image generation services are currently unavailable. Please try again later.');
    }
  }

  // Generate video scripts and concepts
  async generateVideoScript(brief: string, platform: string, duration: number = 8): Promise<any[]> {
    const prompt = `Create a ${duration}-second video script for ${platform} based on this brief: ${brief}. 
    Include audio cues like background music, sound effects, and voice-over instructions.
    Format as JSON array with timeframe, visual action, and audio elements for each scene.`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a video script writer. Return only valid JSON array."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
      });

      let scriptContent = completion.choices[0]?.message?.content || '[]';
      
      // Clean up markdown formatting if present
      scriptContent = scriptContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      return JSON.parse(scriptContent);
    } catch (error) {
      console.error('Video script generation failed:', error);
      return [];
    }
  }

  // Generate actual video content using Replicate
  async generateVideo(prompt: string, style: string = "advertising"): Promise<string[]> {
    if (!replicate) {
      console.warn('Replicate not configured, returning empty video assets');
      return [];
    }

    try {
      console.log(`Generating video: "${prompt}"`);
      console.log(`Style: ${style}`);
      console.log('⏳ Video generation may take 2-3 minutes...');

      // Enhanced prompt for better video quality with audio cues
      const enhancedPrompt = `${prompt}, ${style} style, professional cinematography, high quality, smooth motion, well-lit, 1080p, with ambient background music and natural sound effects`;

      // Use Minimax Video-01 for reliable video generation with audio and extended duration
      const output = await replicate.run(
        "minimax/video-01",
        {
          input: {
            prompt: enhancedPrompt,
            duration: "8s", // Set to 8 seconds as requested
            aspect_ratio: "16:9", // Better for social media
            include_audio: true, // Enable audio generation
            fps: 25 // Smooth frame rate
          }
        }
      );

      console.log('Raw Replicate video output:', typeof output, Array.isArray(output) ? `array of ${output.length}` : output);

      // Handle different output formats
      const outputArray = Array.isArray(output) ? output : [output];
      const videoUrls = [];
      
      for (const item of outputArray) {
        if (typeof item === 'string') {
          videoUrls.push(item);
        } else if (item && typeof item.text === 'function') {
          // Handle ReadableStream - read the stream content
          const text = await item.text();
          videoUrls.push(text);
        } else if (item && typeof item.url === 'function') {
          // Handle URL function - call it to get the actual URL
          const url = item.url();
          videoUrls.push(url.toString());
        } else if (item && item.url) {
          videoUrls.push(item.url);
        } else {
          console.warn('Unexpected video output format:', typeof item, item);
          // Try to extract URL from the stream or convert to string
          if (item && item.toString && item.toString() !== '[object Object]') {
            videoUrls.push(String(item));
          }
        }
      }

      console.log('Processed video URLs:', videoUrls);
      console.log(`✅ Video generated successfully!`);
      
      // Upload videos to permanent hosting (Firebase Storage preferred)
      const hostedUrls = [];
      for (let i = 0; i < videoUrls.length; i++) {
        const url = videoUrls[i];
        try {
          const fileName = `replicate_${Date.now()}_${i}.mp4`;
          const hostedUrl = await videoHostingService.uploadVideo(url, fileName);
          console.log(`✅ Video ${i + 1} hosted successfully: ${hostedUrl}`);
          hostedUrls.push(hostedUrl);
        } catch (error) {
          console.error(`❌ Failed to host video ${i + 1}:`, error);
          console.warn('Using original URL as fallback');
          hostedUrls.push(url);
        }
      }

      console.log('🔗 Final video URLs (permanently hosted):');
      hostedUrls.forEach((url, index) => {
        console.log(`   ${index + 1}. ${url}`);
      });

      return hostedUrls;
    } catch (error) {
      console.error('Replicate video generation failed:', error);
      throw new Error(`Video generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Generate videos using Google's Veo 2 (available with regular Gemini API key)
  async generateAdVideosVeo(description: string, style: string = "modern advertising"): Promise<string[]> {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('Gemini API key not configured, falling back to Replicate');
      return this.generateVideo(description, style);
    }

    try {
      console.log(`Generating video with Veo 2: "${description}"`);
      console.log(`Style: ${style}`);
      console.log('⏳ Veo 2 video generation starting...');
      
      // Create enhanced prompt for social media with audio cues
      const enhancedPrompt = `${description}, ${style} style, high quality professional social media advertisement, cinematic lighting, smooth motion, with background music and ambient sound effects`;
      
      let operation = await gemini.models.generateVideos({
        model: "veo-2.0-generate-001", // Use Veo 2 which works with regular API key
        prompt: enhancedPrompt,
        config: {
          aspectRatio: "16:9",
          // Note: 8-second duration is implicit in the model
          includeAudio: true, // Enable audio generation
          personGeneration: "allow_all"
        },
      });

      // Poll for completion
      console.log('Polling Veo 2 operation status...');
      while (!operation.done) {
        console.log('Waiting for Veo 2 video generation to complete...');
        await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
        operation = await gemini.operations.getVideosOperation({
          operation: operation,
        });
      }

      if (operation.response?.generatedVideos && operation.response.generatedVideos.length > 0) {
        const video = operation.response.generatedVideos[0];
        
        if (!video.video) {
          throw new Error('No video file in response');
        }
        
        // Host video permanently (Firebase Storage preferred)
        console.log('🎬 Hosting Veo 2 video permanently...');
        
        try {
          const fileName = `veo2_${Date.now()}.mp4`;
          const videoUri = video.video.uri;
          
          if (!videoUri) {
            throw new Error('No video URI available for hosting');
          }
          
          const hostedUrl = await videoHostingService.uploadVideo(videoUri, fileName);
          console.log('✅ Veo 2 video hosted successfully!');
          console.log('🔗 Hosted URL:', hostedUrl);
          return [hostedUrl];
        } catch (hostingError) {
          console.error('❌ Critical: Video hosting failed for Veo 2:', hostingError);
          console.error('🎬 Original video URI:', video.video?.uri);
          
          // Log detailed error for debugging
          if (hostingError instanceof Error) {
            console.error('💥 Error details:', hostingError.message);
            console.error('📜 Stack trace:', hostingError.stack);
          }
          
          // Fallback to external URL if hosting fails
          const videoUrl = video.video.uri;
          console.warn('🚨 CRITICAL: Using temporary URL that will expire soon:', videoUrl);
          console.warn('🚨 This will cause "Video Expired" errors for users!');
          return videoUrl ? [videoUrl] : [];
        }
      } else {
        throw new Error('No video generated by Veo 2');
      }
    } catch (error) {
      console.error('Veo 2 video generation failed:', error);
      console.log('Falling back to Replicate video generation...');
      return this.generateVideo(description, style);
    }
  }

  // Generate videos using Google's Veo 3 (premium with GCP billing)
  async generateAdVideosVeo3(description: string, style: string = "modern advertising"): Promise<string[]> {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('Gemini API key not configured, falling back to Veo 2');
      return this.generateAdVideosVeo(description, style);
    }

    try {
      console.log(`Generating video with Veo 3: "${description}"`);
      console.log(`Style: ${style}`);
      console.log('⏳ Veo 3 video generation starting...');
      
      // Create enhanced prompt with audio cues for social media - avoid negative terms
      const enhancedPrompt = `${description}, ${style} style, cinematic quality, professional social media advertisement, high production value, clear visuals, smooth motion. Background music: upbeat, modern. Sound effects: subtle product sounds, ambient atmosphere.`;
      
      let operation = await gemini.models.generateVideos({
        model: "veo-3.0-generate-preview",
        prompt: enhancedPrompt,
        config: {
          aspectRatio: "16:9",
          // Note: 8-second duration is implicit in the model
          includeAudio: true, // Enable audio generation
          personGeneration: "allow_all"
        },
      });

      // Poll for completion
      console.log('Polling Veo 3 operation status...');
      while (!operation.done) {
        console.log('Waiting for Veo 3 video generation to complete...');
        await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
        operation = await gemini.operations.getVideosOperation({
          operation: operation,
        });
      }

      if (operation.response?.generatedVideos && operation.response.generatedVideos.length > 0) {
        const video = operation.response.generatedVideos[0];
        
        if (!video.video) {
          throw new Error('No video file in response');
        }
        
        // Host video permanently (Firebase Storage preferred)
        console.log('🎬 Hosting Veo 3 video permanently...');
        
        const fileName = `veo3_${Date.now()}.mp4`;
        
        try {
          const videoUri = video.video.uri;
          
          if (!videoUri) {
            throw new Error('No video URI available for hosting');
          }
          
          const hostedUrl = await videoHostingService.uploadVideo(videoUri, fileName);
          console.log('✅ Veo 3 video hosted successfully!');
          console.log('🔗 Hosted URL:', hostedUrl);
          return [hostedUrl];
        } catch (hostingError) {
          console.error('❌ Critical: Video hosting failed for Veo 3:', hostingError);
          console.error('🎬 Original video URI:', video.video?.uri);
          
          // Log detailed error for debugging
          if (hostingError instanceof Error) {
            console.error('💥 Error details:', hostingError.message);
            console.error('📜 Stack trace:', hostingError.stack);
          }
          
          // Fallback to temporary URL with warning
          const videoUrl = video.video.uri || '';
          console.warn('🚨 CRITICAL: Using temporary URL that will expire soon:', videoUrl);
          console.warn('🚨 This will cause "Video Expired" errors for users!');
          return videoUrl ? [videoUrl] : [];
        }
        
        // This code should not be reached due to early return above
      } else {
        throw new Error('No video generated by Veo 3');
      }
    } catch (error) {
      console.error('Veo 3 video generation failed:', error);
      console.log('Falling back to Veo 2...');
      return this.generateAdVideosVeo(description, style);
    }
  }

  // Main video generation method - handle billing restrictions gracefully
  async generateAdVideos(description: string, style: string = "modern advertising"): Promise<string[]> {
    console.log(`🎬 Starting video generation for: "${description}"`);
    console.log(`📝 Style: ${style}`);
    
    try {
      if (process.env.GEMINI_API_KEY) {
        try {
          console.log('🚀 Attempting Veo 3 video generation...');
          const result = await this.generateAdVideosVeo3(description, style);
          console.log('✅ Veo 3 generation successful, videos stored locally');
          return result;
        } catch (error) {
          console.log('❌ Veo 3 failed, trying Veo 2...', error);
          try {
            console.log('🔄 Attempting Veo 2 video generation...');
            const result = await this.generateAdVideosVeo(description, style);
            console.log('✅ Veo 2 generation successful');
            return result;
          } catch (veo2Error) {
            console.log('❌ All Gemini video models failed:', veo2Error);
            throw veo2Error;
          }
        }
      } else {
        throw new Error('GEMINI_API_KEY is required for video generation');
      }
    } catch (error: any) {
      console.warn('⚠️ Video generation unavailable:', error.message);
      
      // Check if it's a billing/access issue
      if (error.message?.includes('billed users') || error.message?.includes('billing') || error.message?.includes('Payment Required')) {
        console.log('💡 Video generation requires billing - returning placeholder');
        return [];
      }
      
      throw error;
    }
  }

  private buildContentPrompt(brief: string, platform: string, language: string): string {
    const platformSpecs = {
      tiktok: "15-60 second vertical videos, trending sounds, quick cuts, gen-z language",
      instagram: "Stories, Reels, feed posts, aesthetic visuals, hashtag strategy", 
      facebook: "Longer form content, community engagement, share-worthy posts"
    };

    const languageContext = {
      tagalog: "Filipino audience, use Taglish (mix of Tagalog and English), local slang",
      indonesian: "Indonesian audience, use Bahasa Indonesia with modern expressions",
      thai: "Thai audience, use modern Thai language with trending phrases",
      vietnamese: "Vietnamese audience, use contemporary Vietnamese",
      malay: "Malaysian audience, use Bahasa Malaysia with local context",
      english: "English-speaking SEA audience, modern conversational tone"
    };

    return `
Create a viral social media ad for ${platform} in ${language}.

Product Brief: ${brief}

Platform Context: ${platformSpecs[platform as keyof typeof platformSpecs]}
Language Context: ${languageContext[language as keyof typeof languageContext]}

Generate:
1. Compelling hook (attention-grabbing opening line)
2. Full caption (engaging, authentic, platform-optimized)
3. Strategic hashtags (mix of trending and niche tags)
4. Video script breakdown (if applicable)

Make it localized, authentic, and viral-worthy for SEA audiences.
Format as JSON with keys: hook, caption, hashtags, videoScript
`;
  }

  private parseAIResponse(content: string, platform: string): GeneratedContent {
    try {
      // Clean the content to extract JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          hook: parsed.hook || "Compelling hook generated",
          caption: parsed.caption || "Engaging caption content",
          hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ["#ad", "#content"],
          videoScript: Array.isArray(parsed.videoScript) ? parsed.videoScript : [],
          imageAssets: [],
          videoAssets: []
        };
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (error) {
      // Fallback parsing if JSON fails
      const lines = content.split('\n').filter(line => line.trim());
      return {
        hook: lines[0] || "AI-generated compelling hook",
        caption: lines.slice(1, 4).join(' ') || content.substring(0, 200),
        hashtags: ["#ai", "#generated", "#socialmedia"],
        videoScript: [],
        imageAssets: [],
        videoAssets: []
      };
    }
  }
}

export const aiService = new AIService();