// Test OpenAI content generation only
import { aiService } from './services/ai-service.js';

async function testContentGeneration() {
  console.log('📝 Testing OpenAI Content Generation...');
  
  try {
    const brief = `Product: Premium Mango Glow Soap
Description: Natural handmade soap with mango extract for radiant, glowing skin
Target Audience: Women aged 25-40 interested in natural skincare and beauty
Key Benefits: Natural ingredients, Moisturizing properties, Gives skin a healthy glow
Price Point: Premium but affordable ($15-25)
Unique Selling Point: Made with real mango extract from Philippines`;
    
    const platform = "tiktok";
    const language = "english";
    
    console.log('Generating content for: Premium Mango Glow Soap');
    console.log('Platform:', platform);
    console.log('Language:', language);
    console.log('⏳ Generating...\n');
    
    const startTime = Date.now();
    const content = await aiService.generateAdContent(brief, platform, language);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`✅ Content generated successfully in ${duration}s!`);
    console.log('\n📱 Generated Social Media Content:');
    console.log('━'.repeat(50));
    console.log('🎯 Hook:', content.hook);
    console.log('\n📝 Caption:');
    console.log(content.caption);
    console.log('\n🏷️ Hashtags:', content.hashtags.join(' '));
    console.log('\n🎬 Video Script:', content.videoScript);
    
    return content;
  } catch (error) {
    console.error('❌ Content generation failed:', error);
    throw error;
  }
}

// Run the test
testContentGeneration()
  .then(() => {
    console.log('\n🎉 OpenAI content generation test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error.message);
    process.exit(1);
  });