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
  throw new Error("❌ GEMINI_API_KEY is missing in environment variables.");
}

// --- Lazy singletons
let directClient: GoogleGenAI | null = null;
let vertexClient: GoogleGenAI | null = null;

// === DIRECT API CLIENT (for Gemini text models) ===
function getDirectClient(): GoogleGenAI {
  if (!directClient) {
    if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY in .env");

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
function getClientForModel(model: string): GoogleGenAI {
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

    console.log("✅ GEMINI CLIENT: Content generation successful.", text.length);
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

export async function generateVideos(
  prompt: string,
  model: string = 'veo-3.1-generate-preview', // Use Veo 2 which works with regular API key
  download: boolean = true  // Download the video file
) {

  const config = {
    aspectRatio: "16:9",
    duration: '8s',
  }

  console.log("🖼️ GEMINI CLIENT: Video Content generation started...", model);

  const client = getClientForModel(model);
  let operation = await client.models.generateVideos({
    model: model,
    source: {
      prompt: prompt
    },
    config: {
      numberOfVideos: 1,
      aspectRatio: config.aspectRatio,
      personGeneration: "allow_all"
    }
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

  return operation.response?.generatedVideos || []

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
