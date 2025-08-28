import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// Initialize Firebase Admin if not already initialized
import { getApps } from 'firebase-admin/app';

let firebaseApp: any;
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}') as ServiceAccount;
  
  // Check if any Firebase apps are already initialized
  const existingApps = getApps();
  if (existingApps.length === 0) {
    firebaseApp = initializeApp({
      credential: cert(serviceAccount),
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET
    });
  } else {
    firebaseApp = existingApps[0]; // Use the existing app
  }
} catch (error) {
  console.error('Firebase Admin initialization failed:', error);
}

export class FirebaseStorageService {
  private bucket: any;

  constructor() {
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
   * Upload video from a URL (e.g., from AI service) to Firebase Storage
   * @param videoUrl - URL of the video to download and upload
   * @param filename - Custom filename for the uploaded file
   * @returns Promise<string> - Public download URL
   */
  async uploadVideoFromUrl(videoUrl: string, filename?: string): Promise<string> {
    if (!this.bucket) {
      throw new Error('Firebase Storage not initialized');
    }

    try {
      // Generate unique filename if not provided
      const finalFilename = filename || `video_${uuidv4()}.mp4`;
      const storagePath = `videos/${finalFilename}`;

      // Download video from URL and upload directly to Firebase Storage
      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch video from URL: ${response.statusText}`);
      }

      const videoBuffer = Buffer.from(await response.arrayBuffer());

      // Create a file reference and upload the buffer
      const file = this.bucket.file(storagePath);
      
      await file.save(videoBuffer, {
        metadata: {
          contentType: 'video/mp4',
          metadata: {
            firebaseStorageDownloadTokens: uuidv4(),
          },
        },
        public: true,
      });

      // Get the public download URL
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: '03-17-2125', // Far future date for permanent access
      });

      console.log('✅ Video uploaded to Firebase Storage from URL:', storagePath);
      console.log('🔗 Public URL:', url);

      return url;
    } catch (error) {
      console.error('❌ Firebase Storage upload from URL failed:', error);
      throw new Error(`Failed to upload video from URL to Firebase Storage: ${error}`);
    }
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
   * Check if Firebase Storage is properly configured
   */
  isConfigured(): boolean {
    return !!this.bucket && !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY && !!process.env.VITE_FIREBASE_STORAGE_BUCKET;
  }
}

export const firebaseStorage = new FirebaseStorageService();