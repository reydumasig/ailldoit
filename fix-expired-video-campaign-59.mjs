#!/usr/bin/env node

/**
 * Fix expired video for campaign 59 by downloading the video locally
 * and updating database records to use the new local URL.
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const CAMPAIGN_ID = 59;
const ASSET_ID = 231;
const EXPIRED_URL = 'https://generativelanguage.googleapis.com/v1beta/files/gv8kd7stbc25:download?alt=media';

async function downloadVideo(url, filename) {
  console.log(`📥 Downloading video from: ${url}`);
  
  try {
    const videosDir = path.join(process.cwd(), 'videos');
    
    // Ensure videos directory exists
    if (!fs.existsSync(videosDir)) {
      fs.mkdirSync(videosDir, { recursive: true });
      console.log('📁 Created videos directory');
    }
    
    const localPath = path.join(videosDir, filename);
    
    // Download video using curl
    const { stdout, stderr } = await execAsync(`curl -L "${url}" -o "${localPath}"`);
    
    if (stderr) {
      console.warn('⚠️ Curl warnings:', stderr);
    }
    
    // Check if file was created and has content
    if (fs.existsSync(localPath)) {
      const stats = fs.statSync(localPath);
      if (stats.size > 0) {
        console.log(`✅ Video downloaded successfully: ${filename} (${Math.round(stats.size / 1024)}KB)`);
        return `/videos/${filename}`;
      } else {
        throw new Error('Downloaded file is empty');
      }
    } else {
      throw new Error('Failed to create local file');
    }
  } catch (error) {
    console.error('❌ Download failed:', error);
    throw error;
  }
}

async function updateAssetRecord(assetId, newUrl) {
  console.log(`🔄 Updating asset ${assetId} with new URL: ${newUrl}`);
  
  try {
    const updateQuery = `
      UPDATE assets 
      SET url = '${newUrl}', 
          metadata = COALESCE(metadata, '{}') || '{"locallyStored": true, "originalUrl": "${EXPIRED_URL}", "fixedAt": "${new Date().toISOString()}"}'
      WHERE id = ${assetId}
      RETURNING *;
    `;
    
    const { stdout } = await execAsync(`
      curl -s -X POST "http://localhost:5000/api/execute-sql" \\
        -H "Content-Type: application/json" \\
        -d '{"query": "${updateQuery.replace(/'/g, '\\'').replace(/"/g, '\\"')}"}'
    `);
    
    console.log('✅ Asset record updated successfully');
    return JSON.parse(stdout);
  } catch (error) {
    console.error('❌ Failed to update asset record:', error);
    throw error;
  }
}

async function updateCampaignContent(campaignId, newVideoUrl) {
  console.log(`🔄 Updating campaign ${campaignId} generatedContent...`);
  
  try {
    // First get the current campaign
    const getCurrentQuery = `SELECT * FROM campaigns WHERE id = ${campaignId};`;
    
    const { stdout: currentData } = await execAsync(`
      curl -s -X POST "http://localhost:5000/api/execute-sql" \\
        -H "Content-Type: application/json" \\
        -d '{"query": "${getCurrentQuery}"}'
    `);
    
    const result = JSON.parse(currentData);
    if (!result.rows || result.rows.length === 0) {
      throw new Error(`Campaign ${campaignId} not found`);
    }
    
    const campaign = result.rows[0];
    const generatedContent = campaign.generated_content;
    
    if (generatedContent && generatedContent.videoAssets) {
      // Update videoAssets array to replace expired URL with local URL
      const updatedVideoAssets = generatedContent.videoAssets.map(url => 
        url === EXPIRED_URL ? newVideoUrl : url
      );
      
      const updatedContent = {
        ...generatedContent,
        videoAssets: updatedVideoAssets
      };
      
      // Update the campaign
      const updateQuery = `
        UPDATE campaigns 
        SET generated_content = '${JSON.stringify(updatedContent).replace(/'/g, "''")}'
        WHERE id = ${campaignId};
      `;
      
      await execAsync(`
        curl -s -X POST "http://localhost:5000/api/execute-sql" \\
          -H "Content-Type: application/json" \\
          -d '{"query": "${updateQuery.replace(/"/g, '\\"')}"}'
      `);
      
      console.log('✅ Campaign generatedContent updated successfully');
    }
  } catch (error) {
    console.error('❌ Failed to update campaign content:', error);
    throw error;
  }
}

async function verifyFix(campaignId, assetId, expectedUrl) {
  console.log('🔍 Verifying the fix...');
  
  try {
    // Check asset
    const assetQuery = `SELECT * FROM assets WHERE id = ${assetId};`;
    const { stdout: assetData } = await execAsync(`
      curl -s -X POST "http://localhost:5000/api/execute-sql" \\
        -H "Content-Type: application/json" \\
        -d '{"query": "${assetQuery}"}'
    `);
    
    const assetResult = JSON.parse(assetData);
    const updatedAsset = assetResult.rows?.[0];
    
    // Check campaign
    const campaignQuery = `SELECT * FROM campaigns WHERE id = ${campaignId};`;
    const { stdout: campaignData } = await execAsync(`
      curl -s -X POST "http://localhost:5000/api/execute-sql" \\
        -H "Content-Type: application/json" \\
        -d '{"query": "${campaignQuery}"}'
    `);
    
    const campaignResult = JSON.parse(campaignData);
    const updatedCampaign = campaignResult.rows?.[0];
    
    console.log('📊 Updated asset URL:', updatedAsset?.url);
    console.log('📊 Updated campaign video assets:', updatedCampaign?.generated_content?.videoAssets);
    
    // Verify URLs match
    const assetUrlMatches = updatedAsset?.url === expectedUrl;
    const campaignUrlMatches = updatedCampaign?.generated_content?.videoAssets?.includes(expectedUrl);
    
    if (assetUrlMatches && campaignUrlMatches) {
      console.log('✅ Fix completed successfully! Video is now stored locally and accessible.');
      console.log(`🎬 Local video URL: ${expectedUrl}`);
      return true;
    } else {
      console.error('❌ Fix verification failed - URLs do not match');
      console.error('Asset URL matches:', assetUrlMatches);
      console.error('Campaign URL matches:', campaignUrlMatches);
      return false;
    }
  } catch (error) {
    console.error('❌ Verification failed:', error);
    return false;
  }
}

async function fixExpiredVideo() {
  try {
    console.log('🔄 Starting fix for expired video in campaign 59...');
    console.log(`🎯 Expired URL: ${EXPIRED_URL}`);
    
    // 1. Download video to local storage
    const filename = `veo3_${Date.now()}.mp4`;
    const localVideoUrl = await downloadVideo(EXPIRED_URL, filename);
    
    // 2. Update asset record
    await updateAssetRecord(ASSET_ID, localVideoUrl);
    
    // 3. Update campaign's generatedContent
    await updateCampaignContent(CAMPAIGN_ID, localVideoUrl);
    
    // 4. Verify the fix
    const success = await verifyFix(CAMPAIGN_ID, ASSET_ID, localVideoUrl);
    
    if (success) {
      console.log('🎉 Video fix completed successfully!');
      return true;
    } else {
      throw new Error('Fix verification failed');
    }
    
  } catch (error) {
    console.error('❌ Error fixing expired video:', error);
    throw error;
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