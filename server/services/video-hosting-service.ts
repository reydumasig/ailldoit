// Video hosting service with hierarchy: Object Storage → Firebase → Local
import { firebaseStorage } from './firebase-storage';
import { ObjectStorageService } from '../objectStorage';
import fs from 'fs';
import path from 'path';

export class VideoHostingService {
  private objectStorage = new ObjectStorageService();

  /**
   * Upload video with hierarchy: Object Storage → Firebase → Local
   */
  async uploadVideo(videoUrl: string, filename?: string): Promise<{ url: string, provider: string }> {
    const finalFilename = filename || `video_${Date.now()}.mp4`;
    
    console.log(`🎬 Video hosting initiated for: ${videoUrl}`);
    console.log(`📝 Target filename: ${finalFilename}`);
    
    // First, try immediate download to capture video while URL is fresh
    let videoBuffer: Buffer | null = null;
    
    try {
      console.log('⚡ Attempting immediate video download...');
      
      // Try Object Storage download first (most reliable)
      try {
        videoBuffer = await this.objectStorage.downloadVideoFromUrl(videoUrl, 3);
        console.log('✅ Video downloaded via Object Storage');
      } catch (objectError) {
        console.warn('⚠️ Object Storage download failed, trying Firebase...');
        if (firebaseStorage.isConfigured()) {
          videoBuffer = await firebaseStorage.downloadVideoImmediately(videoUrl, 3);
          console.log('✅ Video downloaded via Firebase Storage');
        } else {
          console.warn('⚠️ Firebase not configured, using direct download...');
          videoBuffer = await this.downloadVideoDirectly(videoUrl, 3);
          console.log('✅ Video downloaded directly');
        }
      }
    } catch (downloadError) {
      console.error('❌ Immediate download failed:', downloadError);
      console.warn('🔄 Attempting traditional upload method as fallback...');
    }
    
    // If we have the video buffer, upload it to permanent storage with hierarchy
    if (videoBuffer) {
      // Try Object Storage first (primary)
      try {
        console.log('📤 Uploading video buffer to Object Storage...');
        const objectUrl = await this.objectStorage.uploadVideoFromBuffer(videoBuffer, finalFilename);
        console.log('✅ Video buffer uploaded to Object Storage successfully');
        return { url: objectUrl, provider: 'object-storage' };
      } catch (objectError) {
        console.error('❌ Object Storage upload failed:', objectError);
        console.warn('🔄 Falling back to Firebase Storage...');
        
        // Try Firebase Storage (secondary)
        try {
          if (firebaseStorage.isConfigured()) {
            console.log('📤 Uploading video buffer to Firebase Storage...');
            const firebaseUrl = await firebaseStorage.uploadVideoFromBuffer(videoBuffer, finalFilename);
            console.log('✅ Video buffer uploaded to Firebase Storage successfully');
            return { url: firebaseUrl, provider: 'firebase' };
          } else {
            console.warn('⚠️ Firebase Storage not configured, falling back to local...');
            throw new Error('Firebase not configured');
          }
        } catch (firebaseError) {
          console.error('❌ Firebase upload failed:', firebaseError);
          console.warn('🔄 Final fallback to local storage...');
          const localUrl = await this.uploadBufferToLocalStorage(videoBuffer, finalFilename);
          return { url: localUrl, provider: 'local' };
        }
      }
    }
    
    // Fallback to traditional method (less likely to work with expired URLs)
    try {
      console.warn('🚨 Using traditional upload method (URL may be expired)');
      
      // Try Object Storage traditional upload
      try {
        console.log('📤 Attempting Object Storage traditional upload...');
        const objectUrl = await this.objectStorage.uploadVideoFromUrl(videoUrl, finalFilename);
        console.log('✅ Video uploaded to Object Storage successfully');
        return { url: objectUrl, provider: 'object-storage' };
      } catch (objectError) {
        console.error('❌ Object Storage traditional upload failed:', objectError);
        
        // Try Firebase Storage traditional upload
        if (firebaseStorage.isConfigured()) {
          console.log('📤 Attempting Firebase Storage upload...');
          const firebaseUrl = await firebaseStorage.uploadVideoFromUrl(videoUrl, finalFilename);
          console.log('✅ Video uploaded to Firebase Storage successfully');
          return { url: firebaseUrl, provider: 'firebase' };
        } else {
          console.warn('⚠️ Firebase Storage not configured, falling back to local storage');
          const localUrl = await this.uploadToLocalStorage(videoUrl, finalFilename);
          return { url: localUrl, provider: 'local' };
        }
      }
    } catch (error) {
      console.error('❌ Traditional upload failed:', error);
      console.warn('🔄 Final fallback to local storage...');
      try {
        const localUrl = await this.uploadToLocalStorage(videoUrl, finalFilename);
        return { url: localUrl, provider: 'local' };
      } catch (localError) {
        console.error('❌ Local storage fallback failed:', localError);
        console.error('❌ All video hosting methods failed. Not storing expired URL.');
        throw new Error(`Video hosting failed: Unable to store video permanently. All download attempts failed due to API permissions. Original error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Direct download method with retry logic (fallback when Firebase not configured)
   */
  private async downloadVideoDirectly(videoUrl: string, maxRetries: number = 3): Promise<Buffer> {
    console.log(`🚀 Direct video download starting: ${videoUrl}`);
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📥 Direct download attempt ${attempt}/${maxRetries}...`);
        
        // Download video with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const response = await fetch(videoUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; VideoDownloader/1.0)',
            'x-goog-api-key': process.env.GEMINI_API_KEY!,
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}: ${await response.text().catch(() => 'No response body')}`);
        }
        
        console.log(`✅ Video fetched directly (${response.headers.get('content-length') || 'unknown'} bytes)`);
        
        const videoBuffer = Buffer.from(await response.arrayBuffer());
        console.log(`📦 Video buffer created: ${Math.round(videoBuffer.length / 1024)}KB`);
        
        return videoBuffer;
      } catch (error: any) {
        lastError = error;
        console.error(`❌ Direct download attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
          console.log(`⏳ Retrying in ${delay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.error('❌ All direct download attempts failed');
    throw new Error(`Failed to download video directly after ${maxRetries} attempts. Last error: ${lastError?.message}`);
  }

  /**
   * Upload video buffer to local storage
   */
  private async uploadBufferToLocalStorage(videoBuffer: Buffer, filename: string): Promise<string> {
    try {
      const videosDir = path.join(process.cwd(), 'videos');
      const localPath = path.join(videosDir, filename);
      
      // Ensure videos directory exists
      if (!fs.existsSync(videosDir)) {
        fs.mkdirSync(videosDir, { recursive: true });
        console.log('📁 Created videos directory');
      }
      
      console.log(`💾 Saving video buffer (${Math.round(videoBuffer.length / 1024)}KB) to: ${localPath}`);
      fs.writeFileSync(localPath, videoBuffer);
      
      const localVideoUrl = `/videos/${filename}`;
      console.log('✅ Video buffer stored locally:', localVideoUrl);
      return localVideoUrl;
    } catch (error) {
      console.error('❌ Local buffer storage failed:', error);
      throw new Error(`Failed to store video buffer locally: ${error}`);
    }
  }

  /**
   * Fallback method to store video locally (traditional approach)
   */
  private async uploadToLocalStorage(videoUrl: string, filename: string): Promise<string> {
    try {
      const videosDir = path.join(process.cwd(), 'videos');
      const localPath = path.join(videosDir, filename);
      
      // Ensure videos directory exists
      if (!fs.existsSync(videosDir)) {
        fs.mkdirSync(videosDir, { recursive: true });
        console.log('📁 Created videos directory');
      }
      
      // Download video from URL
      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.statusText}`);
      }
      
      const videoBuffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(localPath, videoBuffer);
      
      const localVideoUrl = `/videos/${filename}`;
      console.log('✅ Video stored locally as fallback:', localVideoUrl);
      return localVideoUrl;
    } catch (error) {
      console.error('❌ Local storage fallback failed:', error);
      throw new Error(`Failed to store video locally: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if video hosting is properly configured
   */
  isConfigured(): boolean {
    return firebaseStorage.isConfigured();
  }

  /**
   * Get hosting status information
   */
  getHostingStatus(): { provider: string; configured: boolean; message: string } {
    if (firebaseStorage.isConfigured()) {
      return {
        provider: 'Firebase Storage',
        configured: true,
        message: 'Videos will be hosted permanently on Firebase Storage'
      };
    } else {
      return {
        provider: 'Local Storage',
        configured: false,
        message: 'Firebase Storage not configured, using local fallback (may cause issues in production)'
      };
    }
  }
}

export const videoHostingService = new VideoHostingService();