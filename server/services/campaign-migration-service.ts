import { storage } from '../storage';
import { aiService } from './ai-service';
import { assetValidationService } from './asset-validation-service';
import { firebaseStorageService } from './firebase-storage-service';

export class CampaignMigrationService {
  /**
   * Migrate a single campaign's assets to Firebase Storage
   */
  async migrateCampaignAssets(campaignId: number, userId: string): Promise<{
    success: boolean;
    message: string;
    migratedAssets: { images: number, videos: number };
  }> {
    try {
      console.log(`🔄 MIGRATION: Starting migration for campaign ${campaignId}`);
      
      // Get the campaign
      const campaign = await storage.getCampaign(campaignId, userId);
      if (!campaign || !campaign.generatedContent) {
        return {
          success: false,
          message: 'Campaign not found or has no generated content',
          migratedAssets: { images: 0, videos: 0 }
        };
      }

      const generatedContent = typeof campaign.generatedContent === 'string' 
        ? JSON.parse(campaign.generatedContent) 
        : campaign.generatedContent;

      // Validate current assets
      const validation = await assetValidationService.validateCampaignAssets(generatedContent);
      
      if (!validation.needsRegeneration) {
        return {
          success: true,
          message: 'All assets are already valid',
          migratedAssets: { images: 0, videos: 0 }
        };
      }

      console.log(`🔍 MIGRATION: Found ${validation.invalidAssets.images.length} invalid images and ${validation.invalidAssets.videos.length} invalid videos`);

      let migratedImages = 0;
      let migratedVideos = 0;

      // Regenerate images if needed
      if (validation.invalidAssets.images.length > 0) {
        console.log(`🖼️ MIGRATION: Regenerating ${validation.invalidAssets.images.length} images`);
        try {
          const newImages = await aiService.generateAdImages(campaign.brief, 'modern');
          generatedContent.imageAssets = [...validation.validAssets.images, ...newImages];
          migratedImages = newImages.length;
          console.log(`✅ MIGRATION: Generated ${migratedImages} new images`);
        } catch (error) {
          console.error('❌ MIGRATION: Failed to regenerate images:', error);
        }
      }

      // Regenerate videos if needed
      if (validation.invalidAssets.videos.length > 0) {
        console.log(`🎬 MIGRATION: Regenerating ${validation.invalidAssets.videos.length} videos`);
        try {
          const newVideos = await aiService.generateAdVideos(campaign.brief, 'modern advertising');
          generatedContent.videoAssets = [...validation.validAssets.videos, ...newVideos];
          migratedVideos = newVideos.length;
          console.log(`✅ MIGRATION: Generated ${migratedVideos} new videos`);
        } catch (error) {
          console.error('❌ MIGRATION: Failed to regenerate videos:', error);
        }
      }

      // Update the campaign with new assets
      await storage.updateCampaign(campaignId, { 
        generatedContent: generatedContent 
      }, userId);

      console.log(`✅ MIGRATION: Campaign ${campaignId} migrated successfully`);

      return {
        success: true,
        message: `Successfully migrated ${migratedImages} images and ${migratedVideos} videos`,
        migratedAssets: { images: migratedImages, videos: migratedVideos }
      };

    } catch (error: any) {
      console.error('❌ MIGRATION: Campaign migration failed:', error);
      return {
        success: false,
        message: `Migration failed: ${error.message}`,
        migratedAssets: { images: 0, videos: 0 }
      };
    }
  }

  /**
   * Migrate all campaigns for a user
   */
  async migrateUserCampaigns(userId: string): Promise<{
    success: boolean;
    message: string;
    migratedCampaigns: number;
    totalAssets: { images: number, videos: number };
  }> {
    try {
      console.log(`🔄 MIGRATION: Starting migration for user ${userId}`);
      
      // Get all campaigns for the user
      const campaigns = await storage.getCampaigns(userId);
      let migratedCampaigns = 0;
      let totalImages = 0;
      let totalVideos = 0;

      for (const campaign of campaigns) {
        if (campaign.generatedContent) {
          const result = await this.migrateCampaignAssets(campaign.id, userId);
          if (result.success) {
            migratedCampaigns++;
            totalImages += result.migratedAssets.images;
            totalVideos += result.migratedAssets.videos;
          }
        }
      }

      console.log(`✅ MIGRATION: User migration completed - ${migratedCampaigns} campaigns migrated`);

      return {
        success: true,
        message: `Migrated ${migratedCampaigns} campaigns with ${totalImages} images and ${totalVideos} videos`,
        migratedCampaigns,
        totalAssets: { images: totalImages, videos: totalVideos }
      };

    } catch (error: any) {
      console.error('❌ MIGRATION: User migration failed:', error);
      return {
        success: false,
        message: `User migration failed: ${error.message}`,
        migratedCampaigns: 0,
        totalAssets: { images: 0, videos: 0 }
      };
    }
  }

  /**
   * Check if a campaign needs migration
   */
  async checkCampaignMigrationStatus(campaignId: number, userId: string): Promise<{
    needsMigration: boolean;
    message: string;
    invalidAssets: { images: string[], videos: string[] };
  }> {
    try {
      const campaign = await storage.getCampaign(campaignId, userId);
      if (!campaign || !campaign.generatedContent) {
        return {
          needsMigration: false,
          message: 'Campaign has no generated content',
          invalidAssets: { images: [], videos: [] }
        };
      }

      const generatedContent = typeof campaign.generatedContent === 'string' 
        ? JSON.parse(campaign.generatedContent) 
        : campaign.generatedContent;

      const validation = await assetValidationService.validateCampaignAssets(generatedContent);
      
      return {
        needsMigration: validation.needsRegeneration,
        message: validation.needsRegeneration 
          ? assetValidationService.getExpiredAssetMessage(validation.invalidAssets)
          : 'All assets are valid',
        invalidAssets: validation.invalidAssets
      };

    } catch (error: any) {
      console.error('❌ MIGRATION: Check failed:', error);
      return {
        needsMigration: false,
        message: `Check failed: ${error.message}`,
        invalidAssets: { images: [], videos: [] }
      };
    }
  }
}

export const campaignMigrationService = new CampaignMigrationService();
