import OpenAI from 'openai';
import Replicate from 'replicate';
import { GeneratedContent } from '@shared/schema';
import { learningService } from './learning-service';
import { firebaseStorageService } from './firebase-storage-service';
import { videoProcessingService, VideoStitchingOptions } from './video-processing-service';
import { gemini, generateGeminiContent } from './gemini-client';

// Initialize AI services
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export class AIService {
  // Generate ad content using Gemini as primary provider with learning optimization
  async generateAdContent(brief: string, platform: string, language: string, userId?: string): Promise<GeneratedContent> {
    try {
      console.log(`🚀 AI SERVICE: Starting content generation for user ${userId || 'anonymous'}`);
      console.log(`📝 AI SERVICE: Brief: "${brief.substring(0, 100)}..."`);
      console.log(`🎯 AI SERVICE: Platform: ${platform}, Language: ${language}`);
      console.log(`🔑 AI SERVICE: Gemini API Key present: ${!!process.env.GEMINI_API_KEY}`);
      console.log(`🔑 AI SERVICE: Gemini API Key value: ${process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET'}`);
      console.log(`🔑 AI SERVICE: OpenAI API Key present: ${!!process.env.OPENAI_API_KEY}`);
      
      // Try Gemini first (primary provider)
      if (process.env.GEMINI_API_KEY) {
        try {
          console.log(`🧠 AI SERVICE: Using Gemini as primary provider for ${platform}/${language}`);
          console.log(`🔍 AI SERVICE: Shared gemini client type:`, typeof gemini);
          console.log(`🔍 AI SERVICE: Shared gemini client methods:`, Object.getOwnPropertyNames(gemini));
          console.log(`🔍 AI SERVICE: getGenerativeModel available:`, typeof gemini.getGenerativeModel);
          console.log(`🔍 AI SERVICE: Calling generateAdContentWithGemini...`);
          const result = await this.generateAdContentWithGemini(brief, platform, language, userId);
          console.log(`✅ AI SERVICE: Gemini generation successful`);
          return result;
        } catch (geminiError) {
          console.error('❌ AI SERVICE: Gemini primary failed, trying OpenAI fallback:', geminiError);
          console.error('❌ AI SERVICE: Gemini error details:', {
            message: geminiError?.message,
            code: geminiError?.code,
            type: geminiError?.type
          });
        }
      } else {
        console.warn('⚠️ AI SERVICE: GEMINI_API_KEY not available, skipping Gemini');
      }
      
      // Fallback to OpenAI if Gemini fails
      if (process.env.OPENAI_API_KEY) {
        console.log(`🔄 AI SERVICE: Using OpenAI as fallback provider`);
        
        // Get optimized prompts based on learning patterns
        const { systemPrompt, userPrompt } = await learningService.getOptimizedPrompt(
          platform, 
          language, 
          'content', 
          brief
        );
        
        console.log(`🧠 AI SERVICE: Using AI learning-enhanced prompts for ${platform}/${language}`);
        
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

        console.log(`✅ AI SERVICE: OpenAI API call successful`);
        const content = completion.choices[0]?.message?.content;
        if (!content) throw new Error('No content generated');

        const generatedContent = this.parseAIResponse(content, platform);
        
        // Log generation for future learning (if userId provided)
        if (userId) {
          console.log(`📝 AI SERVICE: Content generated with learning insights for user ${userId}`);
        }

        return generatedContent;
      }
      
      throw new Error('No AI providers available (neither Gemini nor OpenAI)');
      
    } catch (error: any) {
      console.error('❌ AI SERVICE: Content generation failed:', error);
      console.error('❌ AI SERVICE: Error type:', error?.constructor?.name);
      console.error('❌ AI SERVICE: Error message:', error?.message);
      console.error('❌ AI SERVICE: Error code:', error?.code);
      
      // Check for specific OpenAI errors
      if (error?.code === 'insufficient_quota') {
        console.error('💳 AI SERVICE: OpenAI quota exceeded - this is the root cause!');
        throw new Error(`OpenAI quota exceeded: ${error.message}`);
      }
      
      if (error?.type === 'insufficient_quota') {
        console.error('💳 AI SERVICE: OpenAI quota exceeded (type) - this is the root cause!');
        throw new Error(`OpenAI quota exceeded: ${error.message}`);
      }
      
      console.log('🔄 AI SERVICE: Attempting fallback to baseline generation...');
      
      // Final fallback to baseline generation
      return this.generateAdContentBaseline(brief, platform, language);
    }
  }

  // Fallback method using Gemini for text generation
  private async generateAdContentWithGemini(brief: string, platform: string, language: string, userId?: string): Promise<GeneratedContent> {
    console.log(`🔄 AI SERVICE: Using Gemini for text generation`);
    console.log(`🔍 AI SERVICE: Gemini method - Brief: "${brief.substring(0, 50)}..."`);
    console.log(`🔍 AI SERVICE: Gemini method - Platform: ${platform}, Language: ${language}`);
    
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ AI SERVICE: GEMINI_API_KEY not available for Gemini generation');
      throw new Error('GEMINI_API_KEY not available for fallback');
    }
    
    console.log(`🔍 AI SERVICE: Building content prompt...`);
    const prompt = this.buildContentPrompt(brief, platform, language);
    console.log(`🔍 AI SERVICE: Prompt length: ${prompt.length} characters`);
    
    console.log(`🔍 AI SERVICE: Calling Gemini API with new format...`);
    const result = await generateGeminiContent(prompt, "gemini-1.5-flash");
    
    if (!result || !result.candidates || !result.candidates[0] || !result.candidates[0].content) {
      console.error('❌ AI SERVICE: No content generated from Gemini');
      throw new Error('No content generated from Gemini');
    }
    
    const content = result.candidates[0].content.parts[0].text;
    
    if (!content) {
      console.error('❌ AI SERVICE: No content text in Gemini response');
      throw new Error('No content text in Gemini response');
    }
    
    console.log(`✅ AI SERVICE: Gemini generation successful, content length: ${content.length}`);
    console.log(`🔍 AI SERVICE: Parsing AI response...`);
    const parsedContent = this.parseAIResponse(content, platform);
    console.log(`✅ AI SERVICE: Response parsed successfully`);
    
    return parsedContent;
  }

  // Fallback method for baseline generation (original logic) - now uses Gemini first
  private async generateAdContentBaseline(brief: string, platform: string, language: string): Promise<GeneratedContent> {
    const prompt = this.buildContentPrompt(brief, platform, language);
    
    // Try Gemini first for baseline generation
    if (process.env.GEMINI_API_KEY) {
      try {
        console.log(`🔄 AI SERVICE: Using Gemini for baseline generation`);
        const result = await generateGeminiContent(prompt, "gemini-1.5-flash");
        
        if (result && result.candidates && result.candidates[0] && result.candidates[0].content) {
          const content = result.candidates[0].content.parts[0].text;
          if (content) {
            console.log(`✅ AI SERVICE: Gemini baseline generation successful`);
            return this.parseAIResponse(content, platform);
          }
        }
      } catch (geminiError) {
        console.error('❌ AI SERVICE: Gemini baseline failed, trying OpenAI:', geminiError);
      }
    }
    
    // Fallback to OpenAI if Gemini fails
    if (process.env.OPENAI_API_KEY) {
      console.log(`🔄 AI SERVICE: Using OpenAI for baseline generation`);
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
    
    throw new Error('No AI providers available for baseline generation');
  }

  // Generate images using Gemini's nano banana model (primary)
  async generateAdImagesGemini(description: string, style: string = "modern"): Promise<string[]> {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is required for image generation');
    }

    try {
      console.log(`🎨 Generating images with Gemini nano banana: "${description}"`);
      console.log(`🎯 Style: ${style}`);
      console.log(`🔑 Using API key: ${process.env.GEMINI_API_KEY?.substring(0, 20)}...`);
      
      const enhancedPrompt = `${description}, ${style} style, high quality, professional advertising photo, clean background, well-lit, commercial photography, product showcase, social media ready, avoid blurry or low quality images, no text or watermarks`;
      
      // Try nano banana model first, then fallback to Imagen models
      const modelNames = [
        "imagen-3.0-generate-001", // Nano banana model (fastest, most cost-effective)
        "imagen-3.0-generate-002", // Latest stable
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
          
          // Handle the correct Gemini API response format
          const responseData = response as any; // Type assertion to handle API response structure
          if (responseData?.candidates && responseData.candidates.length > 0) {
            console.log(`🖼️ Found ${responseData.candidates.length} candidates`);
            
            const imageUrls: string[] = [];
            for (const candidate of responseData.candidates) {
              if (candidate.content?.parts) {
                for (const part of candidate.content.parts) {
                  if (part.inlineData && part.inlineData.data) {
                    // Convert base64 data to data URL for immediate display
                    const dataUrl = `data:image/png;base64,${part.inlineData.data}`;
                    imageUrls.push(dataUrl);
                    console.log(`🖼️ Generated image from ${modelName}`);
                  }
                }
              }
            }
            
            if (imageUrls.length > 0) {
              console.log(`✅ Successfully generated ${imageUrls.length} image(s) with ${modelName}`);
              return imageUrls;
            }
          }
          
          // If no images found in candidates, log the issue
          console.log(`⚠️ Model ${modelName} succeeded but returned no images in expected format`);
          console.log('Available response properties:', Object.keys(response || {}));
          lastError = new Error(`No images returned from ${modelName}`);
          continue;
          
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

  // Generate images using Replicate SDXL (fallback after Gemini)
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

  // Generate images using OpenAI DALL-E 3 (final fallback)
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
      
      const imageUrls = response.data?.map(img => img.url).filter(Boolean) as string[] || [];
      console.log(`📊 Generated ${imageUrls.length} image(s)`);
      
      return imageUrls;
    } catch (error) {
      console.error('❌ OpenAI DALL-E 3 generation failed:', error);
      throw new Error(`Failed to generate images with OpenAI: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Main image generation method with fallbacks - Gemini nano banana Primary
  async generateAdImages(description: string, style: string = "modern"): Promise<string[]> {
    console.log(`🎨 Starting image generation: "${description}"`);
    console.log(`📝 Using Gemini nano banana as primary image generator`);
    
    try {
      // Try Gemini nano banana first (fastest, most cost-effective)
      return await this.generateAdImagesGemini(description, style);
    } catch (error: any) {
      console.warn('⚠️ Gemini nano banana image generation failed:', error.message);
      
      // Fallback to Replicate SDXL if Gemini fails
      console.log('🔄 Falling back to Replicate SDXL for image generation...');
      try {
        return await this.generateAdImagesReplicate(description, style);
      } catch (replicateError: any) {
        console.error('❌ Replicate fallback also failed:', replicateError.message);
        
        // Final fallback to OpenAI DALL-E 3
        console.log('🔄 Final fallback to OpenAI DALL-E 3...');
        try {
          return await this.generateAdImagesOpenAI(description, style);
        } catch (openaiError: any) {
          console.error('❌ All image generation methods failed');
          throw new Error(`All image generation failed: Gemini: ${error.message}, Replicate: ${replicateError.message}, OpenAI: ${openaiError.message}`);
        }
      }
    }
  }

  // Generate video scripts and concepts - now uses Gemini as primary
  async generateVideoScript(brief: string, platform: string, duration: number = 8): Promise<any[]> {
    const prompt = `Create a ${duration}-second video script for ${platform} based on this brief: ${brief}. 
    Include audio cues like background music, sound effects, and voice-over instructions.
    Format as JSON array with timeframe, visual action, and audio elements for each scene.`;

    try {
      // Try Gemini first (primary provider)
      if (process.env.GEMINI_API_KEY) {
        try {
          console.log(`🎬 AI SERVICE: Using Gemini for video script generation`);
          const result = await generateGeminiContent(prompt, "gemini-1.5-flash");
          
          if (result && result.candidates && result.candidates[0] && result.candidates[0].content) {
            let scriptContent = result.candidates[0].content.parts[0].text || '[]';
            
            // Clean up markdown formatting if present
            scriptContent = scriptContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            console.log(`✅ AI SERVICE: Gemini video script generation successful`);
            return JSON.parse(scriptContent);
          }
        } catch (geminiError) {
          console.error('❌ AI SERVICE: Gemini video script failed, trying OpenAI:', geminiError);
        }
      }
      
      // Fallback to OpenAI if Gemini fails
      if (process.env.OPENAI_API_KEY) {
        console.log(`🔄 AI SERVICE: Using OpenAI for video script generation`);
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
      }
      
      throw new Error('No AI providers available for video script generation');
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
        
        // Download and store the video file to Firebase Storage
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
          
          // Download the video file to local storage first
          await gemini.files.download({
            file: video.video,
            downloadPath: localPath,
          });
          
          // Upload to Firebase Storage
          const firebaseUrl = await firebaseStorageService.uploadVideoFromPath(
            localPath,
            fileName,
            {
              provider: 'gemini-veo-2',
              generatedAt: new Date().toISOString(),
              duration: '8s',
              aspectRatio: '16:9',
            }
          );
          
          console.log('✅ Veo 2 video generated and stored in Firebase Storage!');
          console.log('🎬 Firebase video URL:', firebaseUrl);
          return [firebaseUrl];
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
        
        // Download the video file to Firebase Storage
        console.log('Downloading Veo 3 generated video...');
        
        const fileName = `veo3_${Date.now()}.mp4`;
        
        try {
          // Ensure videos directory exists
          const fs = await import('fs');
          const path = await import('path');
          const videosDir = path.join(process.cwd(), 'videos');
          const localPath = path.join(videosDir, fileName);
          
          if (!fs.existsSync(videosDir)) {
            fs.mkdirSync(videosDir, { recursive: true });
            console.log('📁 Created videos directory');
          }
          
          // Download the video file locally first
          await gemini.files.download({
            file: video.video,
            downloadPath: localPath,
          });
          
          // Upload to Firebase Storage
          const firebaseUrl = await firebaseStorageService.uploadVideoFromPath(
            localPath,
            fileName,
            {
              provider: 'gemini-veo-3',
              generatedAt: new Date().toISOString(),
              duration: '8s',
              aspectRatio: '16:9',
            }
          );
          
          console.log('✅ Veo 3 video generated and stored in Firebase Storage!');
          console.log('🎬 Firebase video URL:', firebaseUrl);
          
          return [firebaseUrl];
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
          console.log('✅ Veo 3 generation successful, videos stored in Firebase Storage');
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

  // Generate longer videos by stitching multiple clips together
  async generateLongAdVideos(
    description: string, 
    targetDuration: number = 15,
    style: string = "modern advertising",
    platform: string = "general"
  ): Promise<string[]> {
    console.log(`🎬 Starting long video generation for: "${description}"`);
    console.log(`🎯 Target duration: ${targetDuration}s`);
    console.log(`📝 Style: ${style}, Platform: ${platform}`);
    
    try {
      // Generate multiple video clips for stitching
      const clips = await videoProcessingService.generateVideoClipsForStitching(
        description,
        targetDuration,
        platform
      );
      
      if (clips.length === 0) {
        throw new Error('No video clips generated for stitching');
      }
      
      console.log(`📊 Generated ${clips.length} clips for stitching`);
      
      // Configure stitching options
      const stitchingOptions: VideoStitchingOptions = {
        targetDuration,
        transitionDuration: 0.5,
        outputFormat: 'mp4',
        quality: 'high',
        addFadeTransitions: true,
        addBackgroundMusic: false
      };
      
      // Stitch the videos together
      console.log(`🔗 Stitching ${clips.length} clips into ${targetDuration}s video...`);
      const stitchedVideoUrl = await videoProcessingService.stitchVideos(clips, stitchingOptions);
      
      console.log(`✅ Long video generation completed: ${stitchedVideoUrl}`);
      return [stitchedVideoUrl];
      
    } catch (error: any) {
      console.error('❌ Long video generation failed:', error);
      
      // Fallback to single video generation
      console.log('🔄 Falling back to single video generation...');
      try {
        return await this.generateAdVideos(description, style);
      } catch (fallbackError) {
        console.error('❌ Fallback video generation also failed:', fallbackError);
        throw new Error(`Long video generation failed: ${error.message}. Fallback also failed: ${fallbackError.message}`);
      }
    }
  }
}

export const aiService = new AIService();