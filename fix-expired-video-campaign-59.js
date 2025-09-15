#!/usr/bin/env node

/**
 * Fix expired video for campaign 59 by downloading the video locally
 * and updating database records to use the new local URL.
 */

import { videoHostingService } from './server/services/video-hosting-service.js';
import { storage } from './server/storage.js';
import { db } from './server/db.js';
import { campaigns } from './shared/schema.js';
import { eq } from 'drizzle-orm';

const CAMPAIGN_ID = 59;
const ASSET_ID = 231;
const EXPIRED_URL = 'https://generativelanguage.googleapis.com/v1beta/files/gv8kd7stbc25:download?alt=media';

async function fixExpiredVideo() {
  try {
    console.log('🔄 Starting fix for expired video in campaign 59...');
    
    // 1. Download video to local storage
    console.log('📥 Downloading video from Gemini URL...');
    const filename = `veo3_${Date.now()}.mp4`;
    const localVideoUrl = await videoHostingService.uploadVideo(EXPIRED_URL, filename);
    
    console.log('✅ Video downloaded successfully:', localVideoUrl);
    
    // 2. Get current campaign and asset data
    console.log('📊 Fetching current campaign and asset data...');
    
    // First get the campaign without userId to get the userId, then get it properly
    const campaignData = await db.select().from(campaigns).where(eq(campaigns.id, CAMPAIGN_ID)).limit(1);
    if (campaignData.length === 0) {
      throw new Error(`Campaign ${CAMPAIGN_ID} not found`);
    }
    
    const userId = campaignData[0].userId;
    const campaign = await storage.getCampaign(CAMPAIGN_ID, userId);
    const asset = await storage.getAsset(ASSET_ID);
    
    if (!campaign) {
      throw new Error(`Campaign ${CAMPAIGN_ID} not found`);
    }
    
    if (!asset) {
      throw new Error(`Asset ${ASSET_ID} not found`);
    }
    
    console.log('📋 Current asset URL:', asset.url);
    console.log('📋 Current campaign video assets:', campaign.generatedContent?.videoAssets);
    
    // 3. Update asset record
    console.log('🔄 Updating asset record...');
    await storage.updateAsset(ASSET_ID, {
      url: localVideoUrl,
      metadata: {
        ...asset.metadata,
        locallyStored: true,
        originalUrl: EXPIRED_URL,
        fixedAt: new Date().toISOString()
      }
    });
    
    console.log('✅ Asset record updated successfully');
    
    // 4. Update campaign's generatedContent
    console.log('🔄 Updating campaign generatedContent...');
    const updatedGeneratedContent = {
      ...campaign.generatedContent,
      videoAssets: campaign.generatedContent?.videoAssets?.map(url => 
        url === EXPIRED_URL ? localVideoUrl : url
      ) || [localVideoUrl]
    };
    
    await storage.updateCampaign(CAMPAIGN_ID, {
      generatedContent: updatedGeneratedContent
    }, userId);
    
    console.log('✅ Campaign generatedContent updated successfully');
    
    // 5. Verify the fix
    console.log('🔍 Verifying the fix...');
    const updatedCampaign = await storage.getCampaign(CAMPAIGN_ID, userId);
    const updatedAsset = await storage.getAsset(ASSET_ID);
    
    console.log('📊 Updated asset URL:', updatedAsset?.url);
    console.log('📊 Updated campaign video assets:', updatedCampaign?.generatedContent?.videoAssets);
    
    // Check if URLs match
    if (updatedAsset?.url === localVideoUrl && 
        updatedCampaign?.generatedContent?.videoAssets?.includes(localVideoUrl)) {
      console.log('✅ Fix completed successfully! Video is now stored locally and accessible.');
      console.log(`🎬 Local video URL: ${localVideoUrl}`);
    } else {
      console.error('❌ Fix verification failed - URLs do not match');
    }
    
  } catch (error) {
    console.error('❌ Error fixing expired video:', error);
    process.exit(1);
  }
}

// Run the fix if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fixExpiredVideo()
    .then(() => {
      console.log('🎉 Video fix completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Video fix failed:', error);
      process.exit(1);
    });
}

export { fixExpiredVideo };