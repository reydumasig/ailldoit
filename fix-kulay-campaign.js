// Quick script to regenerate expired image for Kulay Natural campaign
const { AIService } = require('./server/services/ai-service.ts');
const { storage } = require('./server/storage.ts');

async function fixKulayCampaign() {
  try {
    console.log('🔧 Fixing Kulay Natural campaign assets...');
    
    // Get campaign details
    const campaign = await storage.getCampaign(30);
    console.log('Campaign found:', campaign.productName);
    
    // Generate new image using Replicate SDXL
    const aiService = new AIService();
    const imageUrls = await aiService.generateAdImages(
      `Professional product photography of ${campaign.productName}, ${campaign.brief}`, 
      'clean modern advertising style'
    );
    
    if (imageUrls.length > 0) {
      // Update the existing image asset with new URL
      await storage.updateAsset(95, {
        url: imageUrls[0],
        provider: 'replicate-sdxl',
        metadata: { 
          generatedAt: new Date().toISOString(),
          regenerated: true,
          reason: 'Fixed expired OpenAI DALL-E URL'
        }
      });
      
      console.log('✅ Image asset updated successfully!');
      console.log('New image URL:', imageUrls[0]);
    }
    
  } catch (error) {
    console.error('❌ Fix failed:', error);
  }
}

fixKulayCampaign();