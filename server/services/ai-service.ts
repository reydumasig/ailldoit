import OpenAI from 'openai';
import Replicate from 'replicate';
import { GoogleGenAI } from '@google/genai';
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
  async generateAdContent(brief: string, platform: string, language: string, userId?: string): Promise<GeneratedContent> {
    try {
      // Get optimized prompts based on learning patterns
      const { systemPrompt, userPrompt } = await learningService.getOptimizedPrompt(
        platform, 
        language, 
        'content', 
        brief
      );
      
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
            content: userPrompt
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
  async generateAdImagesGemini(description: string, style: string = "modern"): Promise<string[]> {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for image generation');
    }

    try {
      console.log(`🎨 Generating images with Gemini Imagen 3: "${description}"`);
      console.log(`🎯 Style: ${style}`);
      console.log(`🔑 Using API key: ${process.env.GEMINI_API_KEY?.substring(0, 20)}...`);
      
      const enhancedPrompt = `${description}, ${style} style, high quality, professional advertising photo, clean background, well-lit, commercial photography, product showcase, social media ready, avoid blurry or low quality images, no text or watermarks`;
      
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
          
          if (response?.images && response.images.length > 0) {
            console.log(`🖼️ Generated ${response.images.length} images`);
            
            const imageUrls: string[] = [];
            for (const image of response.images) {
              if (image.data) {
                // Convert to data URL for immediate display
                const dataUrl = `data:image/png;base64,${image.data}`;
                imageUrls.push(dataUrl);
              } else if (image.url) {
                imageUrls.push(image.url);
              }
            }
            
            return imageUrls;
          } else if (response?.candidates && response.candidates.length > 0) {
            // Handle different response format
            console.log(`🖼️ Found ${response.candidates.length} candidates`);
            
            const imageUrls: string[] = [];
            for (const candidate of response.candidates) {
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
  async generateAdImagesReplicate(description: string, style: string = "modern"): Promise<string[]> {
    try {
      const output = await replicate.run(
        "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        {
          input: {
            prompt: `${description}, ${style} style, high quality, professional advertising photo, clean background`,
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
  async generateAdImagesOpenAI(description: string, style: string = "modern"): Promise<string[]> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required for image generation');
    }

    try {
      console.log(`🎨 Generating images with OpenAI DALL-E 3: "${description}"`);
      console.log(`🎯 Style: ${style}`);
      
      const enhancedPrompt = `${description}, ${style} style, high quality, professional advertising photo, clean background, well-lit, commercial photography, product showcase, social media ready, 4K resolution, no text or watermarks`;
      
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: enhancedPrompt,
        n: 1,
        size: "1024x1024",
        quality: "standard"
      });

      console.log('✅ OpenAI DALL-E 3 images generated successfully!');
      
      const imageUrls = response.data.map(img => img.url).filter(Boolean) as string[];
      console.log(`📊 Generated ${imageUrls.length} image(s)`);
      
      return imageUrls;
    } catch (error) {
      console.error('❌ OpenAI DALL-E 3 generation failed:', error);
      throw new Error(`Failed to generate images with OpenAI: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Main image generation method with fallbacks - Replicate Primary
  async generateAdImages(description: string, style: string = "modern"): Promise<string[]> {
    console.log(`🎨 Starting image generation: "${description}"`);
    console.log(`📝 Using Replicate as primary image generator`);
    
    try {
      // Try Replicate SDXL first (as requested)
      return await this.generateAdImagesReplicate(description, style);
    } catch (error: any) {
      console.warn('⚠️ Replicate image generation failed:', error.message);
      
      // Fallback to OpenAI DALL-E 3 if Replicate fails
      console.log('🔄 Falling back to OpenAI DALL-E 3 for image generation...');
      try {
        return await this.generateAdImagesOpenAI(description, style);
      } catch (openaiError: any) {
        console.error('❌ OpenAI fallback also failed:', openaiError.message);
        
        // Final fallback to Gemini (may still have billing issues)
        console.log('🔄 Final fallback to Gemini...');
        try {
          return await this.generateAdImagesGemini(description, style);
        } catch (geminiError: any) {
          console.error('❌ All image generation methods failed');
          throw new Error(`All image generation failed: Replicate: ${error.message}, OpenAI: ${openaiError.message}, Gemini: ${geminiError.message}`);
        }
      }
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
      console.log('🎬 Generated video URLs:');
      videoUrls.forEach((url, index) => {
        console.log(`   ${index + 1}. ${url}`);
      });

      return videoUrls;
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
          duration: "8s", // Set to 8 seconds
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
        
        // Download and store the video file locally
        console.log('Downloading Veo 2 generated video...');
        
        try {
          const fs = await import('fs');
          const path = await import('path');
          const fileName = `veo2_${Date.now()}.mp4`;
          const videosDir = path.join(process.cwd(), 'videos');
          const localPath = path.join(videosDir, fileName);
          
          // Ensure videos directory exists
          if (!fs.existsSync(videosDir)) {
            fs.mkdirSync(videosDir, { recursive: true });
          }
          
          // Download the video file to local storage
          await gemini.files.download({
            file: video.video,
            downloadPath: localPath,
          });
          
          // Return local video URL instead of external
          const localVideoUrl = `/videos/${fileName}`;
          console.log('✅ Veo 2 video generated and stored locally!');
          console.log('🎬 Local video URL:', localVideoUrl);
          return [localVideoUrl];
        } catch (downloadError) {
          console.warn('Download failed, using direct URL:', downloadError);
          // Fallback to external URL if download fails
          const videoUrl = video.video.uri;
          console.log('🎬 Fallback video URL:', videoUrl);
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
          duration: "8s", // Set to 8 seconds
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
        
        // Download the video file to local storage
        console.log('Downloading Veo 3 generated video...');
        
        const fileName = `veo3_${Date.now()}.mp4`;
        const localPath = `./videos/${fileName}`;
        
        try {
          // Ensure videos directory exists
          const fs = await import('fs');
          const path = await import('path');
          const videosDir = path.join(process.cwd(), 'videos');
          
          if (!fs.existsSync(videosDir)) {
            fs.mkdirSync(videosDir, { recursive: true });
            console.log('📁 Created videos directory');
          }
          
          // Download the video file locally using proper path
          const fullLocalPath = path.join(videosDir, fileName);
          await gemini.files.download({
            file: video.video,
            downloadPath: fullLocalPath,
          });
          
          // Return local file path instead of temporary Gemini URL
          const videoUrl = `/videos/${fileName}`;
          console.log('✅ Video downloaded and stored locally:', videoUrl);
          
          return [videoUrl];
        } catch (downloadError) {
          console.warn('⚠️ Download failed, video will expire quickly:', downloadError);
          // Fallback to temporary URL with warning
          const videoUrl = video.video.uri || '';
          console.warn('🚨 Using temporary URL that will expire soon:', videoUrl);
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