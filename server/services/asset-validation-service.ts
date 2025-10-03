import axios from 'axios';
import { firebaseStorageService } from './firebase-storage-service';

export class AssetValidationService {
  /**
   * Check if a URL is accessible and not expired
   */
  async isUrlAccessible(url: string): Promise<boolean> {
    try {
      const response = await axios.head(url, { 
        timeout: 5000,
        validateStatus: (status) => status < 400 // Accept 2xx and 3xx status codes
      });
      return response.status < 400;
    } catch (error: any) {
      console.log(`❌ URL not accessible: ${url}`, error.message);
      return false;
    }
  }

  /**
   * Check if a URL is a temporary/expired URL that needs regeneration
   */
  isTemporaryUrl(url: string): boolean {
    const temporaryPatterns = [
      'generativelanguage.googleapis.com/v1beta/files/', // Gemini temporary URLs
      'oaidalleapiprodscus.blob.core.windows.net/private/', // DALL-E temporary URLs
      '/videos/', // Local video URLs
      '/images/', // Local image URLs
    ];

    return temporaryPatterns.some(pattern => url.includes(pattern));
  }

  /**
   * Check if a URL is a Firebase Storage URL (permanent)
   */
  isFirebaseStorageUrl(url: string): boolean {
    return url.includes('storage.googleapis.com') || url.includes('firebasestorage.googleapis.com');
  }

  /**
   * Validate all assets in a campaign's generated content
   */
  async validateCampaignAssets(generatedContent: any): Promise<{
    validAssets: { images: string[], videos: string[] };
    invalidAssets: { images: string[], videos: string[] };
    needsRegeneration: boolean;
  }> {
    const validImages: string[] = [];
    const invalidImages: string[] = [];
    const validVideos: string[] = [];
    const invalidVideos: string[] = [];

    // Check image assets
    if (generatedContent.imageAssets && Array.isArray(generatedContent.imageAssets)) {
      for (const imageUrl of generatedContent.imageAssets) {
        if (this.isTemporaryUrl(imageUrl)) {
          invalidImages.push(imageUrl);
        } else if (this.isFirebaseStorageUrl(imageUrl)) {
          validImages.push(imageUrl);
        } else {
          // Check if URL is accessible
          const isAccessible = await this.isUrlAccessible(imageUrl);
          if (isAccessible) {
            validImages.push(imageUrl);
          } else {
            invalidImages.push(imageUrl);
          }
        }
      }
    }

    // Check video assets
    if (generatedContent.videoAssets && Array.isArray(generatedContent.videoAssets)) {
      for (const videoUrl of generatedContent.videoAssets) {
        if (this.isTemporaryUrl(videoUrl)) {
          invalidVideos.push(videoUrl);
        } else if (this.isFirebaseStorageUrl(videoUrl)) {
          validVideos.push(videoUrl);
        } else {
          // Check if URL is accessible
          const isAccessible = await this.isUrlAccessible(videoUrl);
          if (isAccessible) {
            validVideos.push(videoUrl);
          } else {
            invalidVideos.push(videoUrl);
          }
        }
      }
    }

    const needsRegeneration = invalidImages.length > 0 || invalidVideos.length > 0;

    return {
      validAssets: { images: validImages, videos: validVideos },
      invalidAssets: { images: invalidImages, videos: invalidVideos },
      needsRegeneration
    };
  }

  /**
   * Get a user-friendly error message for expired assets
   */
  getExpiredAssetMessage(invalidAssets: { images: string[], videos: string[] }): string {
    const messages = [];
    
    if (invalidAssets.images.length > 0) {
      messages.push(`${invalidAssets.images.length} image(s) have expired`);
    }
    
    if (invalidAssets.videos.length > 0) {
      messages.push(`${invalidAssets.videos.length} video(s) have expired`);
    }

    if (messages.length === 0) {
      return 'All assets are valid';
    }

    return `Some assets have expired: ${messages.join(', ')}. Please regenerate the campaign to create new assets.`;
  }

  /**
   * Clean up invalid assets from generated content
   */
  cleanInvalidAssets(generatedContent: any, invalidAssets: { images: string[], videos: string[] }): any {
    const cleanedContent = { ...generatedContent };

    if (cleanedContent.imageAssets && Array.isArray(cleanedContent.imageAssets)) {
      cleanedContent.imageAssets = cleanedContent.imageAssets.filter(
        (url: string) => !invalidAssets.images.includes(url)
      );
    }

    if (cleanedContent.videoAssets && Array.isArray(cleanedContent.videoAssets)) {
      cleanedContent.videoAssets = cleanedContent.videoAssets.filter(
        (url: string) => !invalidAssets.videos.includes(url)
      );
    }

    return cleanedContent;
  }
}

export const assetValidationService = new AssetValidationService();
