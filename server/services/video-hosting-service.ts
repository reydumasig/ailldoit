// Video hosting service that prioritizes Firebase Storage over local storage
import { firebaseStorage } from './firebase-storage';
import fs from 'fs';
import path from 'path';

export class VideoHostingService {
  /**
   * Upload video from URL to Firebase Storage with local fallback
   */
  async uploadVideo(videoUrl: string, filename?: string): Promise<string> {
    const finalFilename = filename || `video_${Date.now()}.mp4`;
    
    try {
      // Try Firebase Storage first for permanent hosting
      if (firebaseStorage.isConfigured()) {
        console.log('📤 Uploading video to Firebase Storage...');
        const firebaseUrl = await firebaseStorage.uploadVideoFromUrl(videoUrl, finalFilename);
        console.log('✅ Video uploaded to Firebase Storage successfully');
        return firebaseUrl;
      } else {
        console.warn('⚠️ Firebase Storage not configured, falling back to local storage');
        return await this.uploadToLocalStorage(videoUrl, finalFilename);
      }
    } catch (error) {
      console.error('❌ Firebase Storage upload failed:', error);
      console.warn('🔄 Falling back to local storage...');
      return await this.uploadToLocalStorage(videoUrl, finalFilename);
    }
  }

  /**
   * Fallback method to store video locally
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