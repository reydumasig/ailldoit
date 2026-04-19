/**
 * Script to fix campaign types in database
 * Updates old 'video' campaigns to 'shortVideo' or 'longVideo' based on brief
 */

import { db } from '../db';
import { campaigns } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function fixCampaignTypes() {
  console.log('🔧 Starting campaign type fix...');
  
  try {
    // Get all campaigns with old 'video' type
    const oldVideoCampaigns = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.campaignType, 'video'));
    
    console.log(`📊 Found ${oldVideoCampaigns.length} campaigns with old 'video' type`);
    
    for (const campaign of oldVideoCampaigns) {
      const brief = campaign.brief?.toLowerCase() || '';
      
      // Check if it's a long video script
      const hasLongVideoIndicators = 
        brief.includes('0:') || 
        brief.includes('scene') || 
        brief.includes('minute') ||
        /\d+:\d+/.test(brief) ||
        /\[scene\s*\d+/i.test(campaign.brief || '');
      
      const newType = hasLongVideoIndicators ? 'longVideo' : 'shortVideo';
      
      console.log(`🔄 Updating campaign ${campaign.id}: 'video' → '${newType}'`);
      
      await db
        .update(campaigns)
        .set({ campaignType: newType })
        .where(eq(campaigns.id, campaign.id));
    }
    
    console.log('✅ Campaign type fix completed!');
  } catch (error) {
    console.error('❌ Error fixing campaign types:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  fixCampaignTypes()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { fixCampaignTypes };

