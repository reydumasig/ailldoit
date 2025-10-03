import { admin } from '../config/firebase-admin';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { initializeApp } from 'firebase/app';

// Initialize Firebase client SDK for storage operations
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase app for client SDK
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

export class FirebaseStorageService {
  private bucket = admin.storage().bucket();

  /**
   * Upload a file to Firebase Storage and return the public URL
   */
  async uploadFile(
    filePath: string,
    fileBuffer: Buffer,
    contentType: string,
    metadata?: { [key: string]: string }
  ): Promise<string> {
    try {
      console.log(`📤 FIREBASE STORAGE: Uploading file to ${filePath}`);
      
      const file = this.bucket.file(filePath);
      
      // Upload the file
      await file.save(fileBuffer, {
        metadata: {
          contentType,
          metadata: metadata || {},
        },
        public: true, // Make the file publicly accessible
      });

      // Get the public URL
      const publicUrl = `https://storage.googleapis.com/${this.bucket.name}/${filePath}`;
      
      console.log(`✅ FIREBASE STORAGE: File uploaded successfully: ${publicUrl}`);
      return publicUrl;
    } catch (error: any) {
      console.error('❌ FIREBASE STORAGE: Upload failed:', error);
      throw new Error(`Failed to upload file to Firebase Storage: ${error.message}`);
    }
  }

  /**
   * Upload a video file from a local path to Firebase Storage
   */
  async uploadVideoFromPath(
    localFilePath: string,
    fileName: string,
    metadata?: { [key: string]: string }
  ): Promise<string> {
    try {
      console.log(`📤 FIREBASE STORAGE: Uploading video from ${localFilePath}`);
      
      // Read the file
      const fs = await import('fs');
      const fileBuffer = fs.readFileSync(localFilePath);
      
      // Create storage path
      const storagePath = `videos/${fileName}`;
      
      // Upload to Firebase Storage
      const publicUrl = await this.uploadFile(
        storagePath,
        fileBuffer,
        'video/mp4',
        {
          ...metadata,
          originalName: fileName,
          uploadedAt: new Date().toISOString(),
        }
      );

      // Clean up local file
      try {
        fs.unlinkSync(localFilePath);
        console.log(`🗑️ FIREBASE STORAGE: Local file cleaned up: ${localFilePath}`);
      } catch (cleanupError) {
        console.warn('⚠️ FIREBASE STORAGE: Failed to clean up local file:', cleanupError);
      }

      return publicUrl;
    } catch (error: any) {
      console.error('❌ FIREBASE STORAGE: Video upload failed:', error);
      throw new Error(`Failed to upload video to Firebase Storage: ${error.message}`);
    }
  }

  /**
   * Upload an image buffer to Firebase Storage
   */
  async uploadImageBuffer(
    imageBuffer: Buffer,
    fileName: string,
    metadata?: { [key: string]: string }
  ): Promise<string> {
    try {
      console.log(`📤 FIREBASE STORAGE: Uploading image buffer: ${fileName}`);
      
      // Create storage path
      const storagePath = `images/${fileName}`;
      
      // Upload to Firebase Storage
      const publicUrl = await this.uploadFile(
        storagePath,
        imageBuffer,
        'image/png',
        {
          ...metadata,
          originalName: fileName,
          uploadedAt: new Date().toISOString(),
        }
      );

      return publicUrl;
    } catch (error: any) {
      console.error('❌ FIREBASE STORAGE: Image upload failed:', error);
      throw new Error(`Failed to upload image to Firebase Storage: ${error.message}`);
    }
  }

  /**
   * Delete a file from Firebase Storage
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      console.log(`🗑️ FIREBASE STORAGE: Deleting file: ${filePath}`);
      
      const file = this.bucket.file(filePath);
      await file.delete();
      
      console.log(`✅ FIREBASE STORAGE: File deleted successfully: ${filePath}`);
    } catch (error: any) {
      console.error('❌ FIREBASE STORAGE: Delete failed:', error);
      throw new Error(`Failed to delete file from Firebase Storage: ${error.message}`);
    }
  }

  /**
   * Get file metadata from Firebase Storage
   */
  async getFileMetadata(filePath: string): Promise<any> {
    try {
      const file = this.bucket.file(filePath);
      const [metadata] = await file.getMetadata();
      return metadata;
    } catch (error: any) {
      console.error('❌ FIREBASE STORAGE: Get metadata failed:', error);
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }

  /**
   * Check if a file exists in Firebase Storage
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const file = this.bucket.file(filePath);
      const [exists] = await file.exists();
      return exists;
    } catch (error: any) {
      console.error('❌ FIREBASE STORAGE: Check existence failed:', error);
      return false;
    }
  }

  /**
   * Generate a signed URL for private file access (if needed)
   */
  async getSignedUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
    try {
      const file = this.bucket.file(filePath);
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + expiresIn * 1000,
      });
      return signedUrl;
    } catch (error: any) {
      console.error('❌ FIREBASE STORAGE: Get signed URL failed:', error);
      throw new Error(`Failed to get signed URL: ${error.message}`);
    }
  }
}

export const firebaseStorageService = new FirebaseStorageService();
