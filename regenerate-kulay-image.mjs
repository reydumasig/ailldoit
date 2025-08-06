import { aiService } from './server/services/ai-service.ts';
import { storage } from './server/storage.ts';

async function regenerateKulayImage() {
  try {
    console.log('🔧 Regenerating Kulay Natural image...');
    
    // Campaign details
    const campaignName = "Kulay Naturals Hair Serum";
    const brief = "Professional advertising image for natural hair serum, clean modern style, Filipina woman with shiny healthy hair in tropical garden setting";
    
    console.log('🎨 Generating new image with Replicate SDXL...');
    
    // Generate new image using our primary provider (Replicate SDXL)
    const imageUrls = await aiService.generateAdImages(brief, 'clean modern advertising photography');
    
    if (imageUrls.length > 0) {
      const newImageUrl = imageUrls[0];
      console.log('✅ New image generated:', newImageUrl);
      
      // Update asset in database
      const result = await storage.updateAsset(95, {
        url: newImageUrl,
        provider: 'replicate-sdxl',
        metadata: { 
          generatedAt: new Date().toISOString(),
          regenerated: true,
          reason: 'Fixed expired OpenAI DALL-E URL - production fix'
        }
      });
      
      // Update campaign content
      const campaign = await storage.getCampaign(30);
      if (campaign.generatedContent) {
        const content = campaign.generatedContent;
        if (content.imageAssets) {
          content.imageAssets[0] = newImageUrl;
          await storage.updateCampaign(30, { generatedContent: content }, '87439f09-8b35-450d-b840-230558037a9a');
        }
      }
      
      console.log('✅ Campaign 30 (Kulay Natural) image fixed successfully!');
      console.log('🖼️ New image URL:', newImageUrl);
    } else {
      console.log('❌ Failed to generate image');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

regenerateKulayImage();