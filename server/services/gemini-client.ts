import { GoogleGenAI, Modality } from "@google/genai";
import * as fs from 'fs';
import * as path from 'path';
import { firebaseStorageService } from "./firebase-storage-service";

// Load environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
const GOOGLE_GENAI_MODEL = process.env.GOOGLE_GENAI_MODEL || "gemini-2.5-flash";

if (!GEMINI_API_KEY) {
  console.warn("⚠️ GEMINI_API_KEY is missing - Gemini features will not be available");
}

// --- Lazy singletons
let directClient: GoogleGenAI | null = null;
let vertexClient: GoogleGenAI | null = null;

// === DIRECT API CLIENT (for Gemini text models) ===
function getDirectClient(): GoogleGenAI {
  if (!directClient) {
    if (!GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY in .env - Gemini features require an API key");
    }

    directClient = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
      vertexai: false, // ensures it uses the direct public API
    });

    console.log("✅ Initialized Direct Gemini client (API Key)");
  }
  return directClient;
}

// === VERTEX AI CLIENT (for Imagen models) ===
function getVertexClient(): GoogleGenAI {
  if (!vertexClient) {
    if (!GOOGLE_CLOUD_PROJECT) throw new Error("Missing GOOGLE_CLOUD_PROJECT");
    if (!GOOGLE_CLOUD_LOCATION) throw new Error("Missing GOOGLE_CLOUD_LOCATION");

    vertexClient = new GoogleGenAI({
      vertexai: true,
      project: GOOGLE_CLOUD_PROJECT,
      location: GOOGLE_CLOUD_LOCATION,
    });

    console.log("✅ Initialized Vertex AI client (Service Account)");
  }
  return vertexClient;
}

// === SMART ROUTER ===
export function getClientForModel(model: string): GoogleGenAI {
  if (model.startsWith("imagen-") || model.includes("imagegeneration") || model.endsWith("-image")) {
    return getVertexClient();
  }
  return getDirectClient();
}

/**
 * Generate text or structured content from Gemini
 */
export async function generateGeminiContent(
  prompt: string,
  model: string = GOOGLE_GENAI_MODEL
) {
  console.log(`🧠 GEMINI CLIENT: Generating content with model: ${model}`);
  console.log(`📜 GEMINI CLIENT: Prompt length: ${prompt.length}`);

  try {
    const client = getClientForModel(model);
    const response = await client.models.generateContent({
      model,
      contents: prompt,
    });

    // Depending on SDK version, response may be plain text or object
    const text = (response as any)?.text ?? JSON.stringify(response, null, 2);

    console.log("✅ GEMINI CLIENT: Content generation successful.", text);
    return {
      response: {
        candidates: [
          {
            content: { parts: [{ text }] },
          },
        ],
      },
    };
  } catch (error) {
    console.error("❌ GEMINI CLIENT: Content generation failed:", error);
    throw error;
  }
}

export async function generateImages(
  prompt: string,
  modelName: string = 'imagen-4.0-ultra-generate-001', // defaults to vertex ai imagen,
) {

  console.log("🖼️ GEMINI CLIENT: Image Content generation started...");

  const client = getClientForModel(modelName);
  const response2 = await client.models.generateImages({
    model: modelName,
    prompt: prompt,
    config: {
      numberOfImages: 1,
      includeRaiReason: true,
    },
  });

  console.log("🖼️ GEMINI CLIENT: Image generation response: (images)", response2?.generatedImages?.length);
  console.log("🖼️ GEMINI CLIENT: Image generation response: (base64)", response2?.generatedImages?.[0]?.image?.imageBytes?.substring(0, 10));

  return response2?.generatedImages || []

}

export interface VideoGenerationOptions {
  previousVideoFile?: any; // File object from previous segment for Scene Extension
  referenceImages?: string[]; // Up to 3 reference images (base64 or file paths) for Ingredient-to-Video
  firstFrame?: string; // First frame image (base64 or file path) for frame-locking
  lastFrame?: string; // Last frame image (base64 or file path) for frame-locking
  aspectRatio?: "16:9" | "9:16" | "1:1";
  duration?: string;
  model?: string;
}

export async function generateVideos(
  prompt: string,
  model: string = 'veo-3.0-generate-preview',
  download: boolean = true,
  options?: VideoGenerationOptions
): Promise<string[]> {

  const config = {
    aspectRatio: options?.aspectRatio || "16:9",
    duration: options?.duration || '8s',
  }

  console.log("🖼️ GEMINI CLIENT: Video Content generation started...");
  console.log(`📝 GEMINI CLIENT: Prompt: "${prompt.substring(0, 100)}..."`);
  if (options?.previousVideoFile) {
    console.log("🔗 GEMINI CLIENT: Using Scene Extension (previous video file provided)");
  }
  if (options?.referenceImages && options.referenceImages.length > 0) {
    console.log(`🖼️ GEMINI CLIENT: Using ${options.referenceImages.length} reference images for visual consistency`);
  }
  if (options?.firstFrame) {
    console.log("📸 GEMINI CLIENT: Using first frame specification for frame-locking");
  }

  const client = getClientForModel(model);
  
  // Build source object with prompt and optional video file for Scene Extension
  const source: any = {
    prompt: prompt
  };
  
  // Add previous video file for Scene Extension (Veo 3.1 feature)
  if (options?.previousVideoFile) {
    source.video = options.previousVideoFile;
    console.log("✅ GEMINI CLIENT: Scene Extension enabled - continuing from previous segment");
  }
  
  // Build config with reference images for Ingredient-to-Video (Veo 3.1 feature)
  const videoConfig: any = {
    numberOfVideos: 1,
    aspectRatio: config.aspectRatio,
    personGeneration: "allow_all"
  };
  
  // Add reference images for visual consistency (up to 3 images)
  if (options?.referenceImages && options.referenceImages.length > 0) {
    // Convert base64 or file paths to file objects if needed
    const referenceImageFiles = await Promise.all(
      options.referenceImages.slice(0, 3).map(async (img) => {
        if (img.startsWith('data:image') || img.startsWith('/')) {
          // Handle base64 or local file path
          // For now, we'll need to upload these to Files API first
          // This is a simplified version - in production, upload to Files API
          return img;
        }
        return img;
      })
    );
    videoConfig.referenceImages = referenceImageFiles;
    console.log(`✅ GEMINI CLIENT: Added ${referenceImageFiles.length} reference images for visual consistency`);
  }
  
  // Add first/last frame specifications for frame-locking
  if (options?.firstFrame) {
    videoConfig.firstFrame = options.firstFrame;
  }
  if (options?.lastFrame) {
    videoConfig.lastFrame = options.lastFrame;
  }

  let operation = await client.models.generateVideos({
    model: model.includes('veo-3') ? 'veo-3.1-generate-preview' : 'veo-2.0-generate-001',
    source: source,
    config: videoConfig
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await client.operations.getVideosOperation({operation: operation});
  }

  console.log(operation.response?.generatedVideos?.[0]?.video?.uri);

  console.log("🖼️ GEMINI CLIENT: Video generation response: (videos)", operation.response?.generatedVideos?.length);
  console.log("🖼️ GEMINI CLIENT: Video generation response: (uri)", operation.response?.generatedVideos?.[0]?.video?.uri);

  if(download) { // Handles downloading of generated video content

    if(
      operation?.response?.generatedVideos && 
      operation?.response?.generatedVideos?.length > 0
    ){
      const video = operation?.response?.generatedVideos[0]

      if (!video.video) {
        throw new Error('No video file in response');
      }

      // Download the video file to Firebase Storage
      console.log('Downloading Veo 3 generated video...');
    
      const fileName = `veo3_${Date.now()}.mp4`;

      try {
        // Ensure videos directory exist
        const videosDir = path.join(process.cwd(), 'videos');
        const localPath = path.join(videosDir, fileName);
                
        if (!fs.existsSync(videosDir)) {
          fs.mkdirSync(videosDir, { recursive: true });
          console.log('📁 Created videos directory');
        }
                
        // Download the video file locally first
        await client.files.download({
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
            duration: config.duration,
            aspectRatio: config.aspectRatio,
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
    }

  }

  // Non-download path: return the temporary URIs from the generated videos
  return (operation.response?.generatedVideos ?? [])
    .map((v) => v?.video?.uri)
    .filter((uri): uri is string => Boolean(uri));

}

/**
 * Upload a file to Gemini Files API for use in video generation
 * Required for Scene Extension feature (files > 20MB or videos)
 */
export async function uploadFileToGemini(
  filePath: string,
  mimeType: string = 'video/mp4'
): Promise<any> {
  try {
    console.log(`☁️ GEMINI FILES: Uploading file to Files API: ${filePath}`);
    const client = getDirectClient();
    
    const file = await client.files.upload({
      file: filePath,
      config: { mimeType },
    });
    
    console.log(`✅ GEMINI FILES: File uploaded successfully: ${file.name}`);
    return file;
  } catch (error) {
    console.error('❌ GEMINI FILES: Failed to upload file:', error);
    throw error;
  }
}

/**
 * Exported Gemini object for compatibility with existing code
 */
export const gemini = {
  //  
  generateGeminiContent,
  generateImages,
  generateVideos
};

export default { gemini, generateGeminiContent };
