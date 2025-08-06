import { storage } from '../config/firebase';
import AWS from 'aws-sdk';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Configure AWS S3 (fallback option)
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
});

export class StorageService {
  private useFirebase = process.env.STORAGE_PROVIDER === 'firebase';

  // Upload file to configured storage
  async uploadFile(file: Buffer, fileName: string, contentType: string): Promise<string> {
    if (this.useFirebase) {
      return this.uploadToFirebase(file, fileName, contentType);
    } else {
      return this.uploadToS3(file, fileName, contentType);
    }
  }

  // Upload multiple files (for generated assets)
  async uploadFiles(files: { buffer: Buffer; name: string; type: string }[]): Promise<string[]> {
    const uploadPromises = files.map(file => 
      this.uploadFile(file.buffer, file.name, file.type)
    );
    return Promise.all(uploadPromises);
  }

  // Firebase Storage upload
  private async uploadToFirebase(file: Buffer, fileName: string, contentType: string): Promise<string> {
    try {
      const bucket = storage.bucket();
      const fileRef = bucket.file(`campaigns/${uuidv4()}-${fileName}`);
      
      await fileRef.save(file, {
        metadata: {
          contentType,
        },
      });

      // Make file publicly readable
      await fileRef.makePublic();
      
      return `https://storage.googleapis.com/${bucket.name}/${fileRef.name}`;
    } catch (error) {
      console.error('Firebase upload failed:', error);
      throw new Error('Failed to upload to Firebase Storage');
    }
  }

  // AWS S3 upload
  private async uploadToS3(file: Buffer, fileName: string, contentType: string): Promise<string> {
    try {
      const key = `campaigns/${uuidv4()}-${fileName}`;
      
      const result = await s3.upload({
        Bucket: process.env.AWS_S3_BUCKET || 'ailldoit-assets',
        Key: key,
        Body: file,
        ContentType: contentType,
        ACL: 'public-read',
      }).promise();

      return result.Location;
    } catch (error) {
      console.error('S3 upload failed:', error);
      throw new Error('Failed to upload to S3');
    }
  }

  // Delete file from storage
  async deleteFile(fileUrl: string): Promise<void> {
    if (this.useFirebase) {
      await this.deleteFromFirebase(fileUrl);
    } else {
      await this.deleteFromS3(fileUrl);
    }
  }

  private async deleteFromFirebase(fileUrl: string): Promise<void> {
    try {
      const bucket = storage.bucket();
      const fileName = this.extractFileNameFromUrl(fileUrl);
      await bucket.file(fileName).delete();
    } catch (error) {
      console.error('Firebase delete failed:', error);
    }
  }

  private async deleteFromS3(fileUrl: string): Promise<void> {
    try {
      const key = this.extractFileNameFromUrl(fileUrl);
      await s3.deleteObject({
        Bucket: process.env.AWS_S3_BUCKET || 'ailldoit-assets',
        Key: key,
      }).promise();
    } catch (error) {
      console.error('S3 delete failed:', error);
    }
  }

  private extractFileNameFromUrl(fileUrl: string): string {
    return fileUrl.split('/').pop() || '';
  }

  // Generate signed URL for temporary access
  async generateSignedUrl(fileName: string, expiresIn = 3600): Promise<string> {
    if (this.useFirebase) {
      const bucket = storage.bucket();
      const file = bucket.file(fileName);
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + expiresIn * 1000,
      });
      return url;
    } else {
      return s3.getSignedUrl('getObject', {
        Bucket: process.env.AWS_S3_BUCKET || 'ailldoit-assets',
        Key: fileName,
        Expires: expiresIn,
      });
    }
  }
}

export const storageService = new StorageService();