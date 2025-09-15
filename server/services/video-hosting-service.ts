// Video hosting service that prioritizes Firebase Storage over local storage
import { firebaseStorage } from './firebase-storage';
import fs from 'fs';
import path from 'path';

export class VideoHostingService {
  /**
   * Upload video from URL to Firebase Storage with immediate download and local fallback
   */
  async uploadVideo(videoUrl: string, filename?: string): Promise<string> {
    const finalFilename = filename || `video_${Date.now()}.mp4`;
    
    console.log(`🎬 Video hosting initiated for: ${videoUrl}`);
    console.log(`📝 Target filename: ${finalFilename}`);
    
    // First, try immediate download to capture video while URL is fresh
    let videoBuffer: Buffer | null = null;
    
    try {
      console.log('⚡ Attempting immediate video download...');
      
      if (firebaseStorage.isConfigured()) {
        // Use Firebase Storage's immediate download method
        videoBuffer = await firebaseStorage.downloadVideoImmediately(videoUrl, 3);
        console.log('✅ Video downloaded immediately via Firebase Storage');
      } else {
        console.log('⚠️ Firebase not configured, using direct download...');
        videoBuffer = await this.downloadVideoDirectly(videoUrl, 3);
        console.log('✅ Video downloaded directly');
      }
    } catch (downloadError) {
      console.error('❌ Immediate download failed:', downloadError);
      console.warn('🔄 Attempting traditional upload method as fallback...');
    }
    
    // If we have the video buffer, upload it to permanent storage
    if (videoBuffer) {
      try {
        if (firebaseStorage.isConfigured()) {
          console.log('📤 Uploading video buffer to Firebase Storage...');
          const firebaseUrl = await firebaseStorage.uploadVideoFromBuffer(videoBuffer, finalFilename);
          console.log('✅ Video buffer uploaded to Firebase Storage successfully');
          return firebaseUrl;
        } else {
          console.warn('⚠️ Firebase Storage not configured, storing locally...');
          return await this.uploadBufferToLocalStorage(videoBuffer, finalFilename);
        }
      } catch (uploadError) {
        console.error('❌ Buffer upload failed:', uploadError);
        console.warn('🔄 Falling back to local storage...');
        return await this.uploadBufferToLocalStorage(videoBuffer, finalFilename);
      }
    }
    
    // Fallback to traditional method (less likely to work with expired URLs)
    try {
      console.warn('🚨 Using traditional upload method (URL may be expired)');
      if (firebaseStorage.isConfigured()) {
        console.log('📤 Attempting Firebase Storage upload...');
        const firebaseUrl = await firebaseStorage.uploadVideoFromUrl(videoUrl, finalFilename);
        console.log('✅ Video uploaded to Firebase Storage successfully');
        return firebaseUrl;
      } else {
        console.warn('⚠️ Firebase Storage not configured, falling back to local storage');
        return await this.uploadToLocalStorage(videoUrl, finalFilename);
      }
    } catch (error) {
      console.error('❌ Traditional upload failed:', error);
      console.warn('🔄 Final fallback to local storage...');
      try {
        return await this.uploadToLocalStorage(videoUrl, finalFilename);
      } catch (localError) {
        console.error('❌ All video hosting methods failed. Not storing expired URL.');
        throw new Error(`Video hosting failed: Unable to store video permanently. Original error: ${error instanceof Error ? error.message : String(error)}`);
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
      // Return original URL as last resort (will expire)
      console.warn('🚨 Using original URL - may expire soon:', videoUrl);
      return videoUrl;
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