import { getStorage } from 'firebase-admin/storage';
import { getApps } from 'firebase-admin/app';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// Use existing Firebase Admin app instead of creating a new one
let firebaseApp: any;
try {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseApp = existingApps[0]; // Use the existing app
    console.log('✅ Firebase Storage using existing Firebase Admin app');
  } else {
    console.error('Firebase Storage initialization failed because Firebase Admin app wasn\'t properly initialized');
    console.error('No existing Firebase Admin apps found - ensure Firebase Admin is initialized first');
  }
} catch (error) {
  console.error('Firebase Storage initialization failed because Firebase Admin app wasn\'t properly initialized');
  console.error('Firebase Storage initialization error:', error);
}

export class FirebaseStorageService {
  private bucket: any;

  constructor() {
    if (!firebaseApp) {
      console.warn('⚠️  Firebase Storage not available - Firebase Admin not initialized');
      return;
    }
    
    try {
      this.bucket = getStorage(firebaseApp).bucket();
    } catch (error) {
      console.error('Firebase Storage bucket initialization failed:', error);
    }
  }

  /**
   * Upload a video file to Firebase Storage
   * @param localFilePath - Path to the local video file
   * @param filename - Custom filename for the uploaded file
   * @returns Promise<string> - Public download URL
   */
  async uploadVideo(localFilePath: string, filename?: string): Promise<string> {
    if (!this.bucket) {
      throw new Error('Firebase Storage not initialized');
    }

    try {
      // Generate unique filename if not provided
      const finalFilename = filename || `video_${uuidv4()}.mp4`;
      const storagePath = `videos/${finalFilename}`;

      // Upload file to Firebase Storage
      const [file] = await this.bucket.upload(localFilePath, {
        destination: storagePath,
        metadata: {
          metadata: {
            firebaseStorageDownloadTokens: uuidv4(), // For public access
          },
        },
        public: true, // Make the file publicly accessible
      });

      // Get the public download URL
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: '03-17-2125', // Far future date for permanent access
      });

      console.log('✅ Video uploaded to Firebase Storage:', storagePath);
      console.log('🔗 Public URL:', url);

      return url;
    } catch (error) {
      console.error('❌ Firebase Storage upload failed:', error);
      throw new Error(`Failed to upload video to Firebase Storage: ${error}`);
    }
  }

  /**
   * Upload video from a URL (e.g., from AI service) to Firebase Storage with immediate download and retry logic
   * @param videoUrl - URL of the video to download and upload
   * @param filename - Custom filename for the uploaded file
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns Promise<string> - Public download URL
   */
  async uploadVideoFromUrl(videoUrl: string, filename?: string, maxRetries: number = 3): Promise<string> {
    if (!this.bucket) {
      throw new Error('Firebase Storage not initialized');
    }

    // Generate unique filename if not provided
    const finalFilename = filename || `video_${uuidv4()}.mp4`;
    const storagePath = `videos/${finalFilename}`;
    
    console.log(`🚀 Starting immediate video download from URL: ${videoUrl}`);
    console.log(`📁 Target storage path: ${storagePath}`);
    console.log(`🔁 Max retries: ${maxRetries}`);

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📥 Download attempt ${attempt}/${maxRetries}...`);
        
        // Download video with timeout and immediate execution
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
        
        console.log(`✅ Video fetched successfully (${response.headers.get('content-length') || 'unknown'} bytes)`);
        
        const videoBuffer = Buffer.from(await response.arrayBuffer());
        console.log(`📦 Video buffer created: ${Math.round(videoBuffer.length / 1024)}KB`);

        // Create a file reference and upload the buffer
        const file = this.bucket.file(storagePath);
        
        await file.save(videoBuffer, {
          metadata: {
            contentType: 'video/mp4',
            metadata: {
              firebaseStorageDownloadTokens: uuidv4(),
              originalUrl: videoUrl,
              uploadedAt: new Date().toISOString(),
            },
          },
          public: true,
        });
        
        console.log(`☁️ Video uploaded to Firebase Storage successfully`);

        // Get the public download URL
        const [url] = await file.getSignedUrl({
          action: 'read',
          expires: '03-17-2125', // Far future date for permanent access
        });

        console.log('✅ Video uploaded to Firebase Storage from URL:', storagePath);
        console.log('🔗 Public URL:', url);

        return url;
      } catch (error: any) {
        lastError = error;
        console.error(`❌ Attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
          console.log(`⏳ Retrying in ${delay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.error('❌ All download attempts failed');
    throw new Error(`Failed to upload video from URL to Firebase Storage after ${maxRetries} attempts. Last error: ${lastError?.message}`);
  }

  /**
   * Delete a video from Firebase Storage
   * @param fileUrl - The Firebase Storage URL of the file to delete
   */
  async deleteVideo(fileUrl: string): Promise<void> {
    if (!this.bucket) {
      throw new Error('Firebase Storage not initialized');
    }

    try {
      // Extract filename from URL
      const urlParts = fileUrl.split('/');
      const filename = urlParts[urlParts.length - 1].split('?')[0]; // Remove query params
      const storagePath = `videos/${filename}`;

      const file = this.bucket.file(storagePath);
      await file.delete();

      console.log('✅ Video deleted from Firebase Storage:', storagePath);
    } catch (error) {
      console.error('❌ Firebase Storage deletion failed:', error);
      throw new Error(`Failed to delete video from Firebase Storage: ${error}`);
    }
  }

  /**
   * Upload video from a buffer to Firebase Storage
   * @param videoBuffer - Video content as Buffer
   * @param filename - Custom filename for the uploaded file
   * @returns Promise<string> - Public download URL
   */
  async uploadVideoFromBuffer(videoBuffer: Buffer, filename?: string): Promise<string> {
    if (!this.bucket) {
      throw new Error('Firebase Storage not initialized');
    }

    try {
      // Generate unique filename if not provided
      const finalFilename = filename || `video_${uuidv4()}.mp4`;
      const storagePath = `videos/${finalFilename}`;
      
      console.log(`📦 Uploading video buffer (${Math.round(videoBuffer.length / 1024)}KB) to: ${storagePath}`);

      // Create a file reference and upload the buffer
      const file = this.bucket.file(storagePath);
      
      await file.save(videoBuffer, {
        metadata: {
          contentType: 'video/mp4',
          metadata: {
            firebaseStorageDownloadTokens: uuidv4(),
            uploadedAt: new Date().toISOString(),
          },
        },
        public: true,
      });

      // Get the public download URL
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: '03-17-2125', // Far future date for permanent access
      });

      console.log('✅ Video buffer uploaded to Firebase Storage:', storagePath);
      console.log('🔗 Public URL:', url);

      return url;
    } catch (error) {
      console.error('❌ Firebase Storage upload from buffer failed:', error);
      throw new Error(`Failed to upload video buffer to Firebase Storage: ${error}`);
    }
  }

  /**
   * Download video immediately and return buffer (for immediate processing)
   * @param videoUrl - URL of the video to download
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns Promise<Buffer> - Video content as buffer
   */
  async downloadVideoImmediately(videoUrl: string, maxRetries: number = 3): Promise<Buffer> {
    console.log(`🚀 Immediate video download starting: ${videoUrl}`);
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📥 Download attempt ${attempt}/${maxRetries}...`);
        
        // Download video with timeout and immediate execution
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
        
        console.log(`✅ Video fetched successfully (${response.headers.get('content-length') || 'unknown'} bytes)`);
        
        const videoBuffer = Buffer.from(await response.arrayBuffer());
        console.log(`📦 Video buffer created: ${Math.round(videoBuffer.length / 1024)}KB`);
        
        return videoBuffer;
      } catch (error: any) {
        lastError = error;
        console.error(`❌ Download attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
          console.log(`⏳ Retrying in ${delay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.error('❌ All download attempts failed');
    throw new Error(`Failed to download video after ${maxRetries} attempts. Last error: ${lastError?.message}`);
  }

  /**
   * Check if Firebase Storage is properly configured
   */
  isConfigured(): boolean {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_NEW || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    return !!this.bucket && !!serviceAccountKey && !!process.env.VITE_FIREBASE_STORAGE_BUCKET;
  }
}

// Lazy initialization to avoid startup issues
let _firebaseStorage: FirebaseStorageService | null = null;

export const firebaseStorage = {
  get instance() {
    if (!_firebaseStorage) {
      _firebaseStorage = new FirebaseStorageService();
    }
    return _firebaseStorage;
  },
  
  // Proxy methods to the instance
  uploadVideo: (...args: any[]) => this.instance.uploadVideo(...args),
  uploadVideoFromUrl: (...args: any[]) => this.instance.uploadVideoFromUrl(...args),
  deleteVideo: (...args: any[]) => this.instance.deleteVideo(...args),
  uploadVideoFromBuffer: (...args: any[]) => this.instance.uploadVideoFromBuffer(...args),
  downloadVideoImmediately: (...args: any[]) => this.instance.downloadVideoImmediately(...args),
  isConfigured: () => _firebaseStorage ? _firebaseStorage.isConfigured() : false
};