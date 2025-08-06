// Test script for AI services
import { aiService } from './services/ai-service.js';

async function testImageGeneration() {
  console.log('🎨 Testing AI Image Generation...');
  
  try {
    const description = "A premium skincare product bottle with natural ingredients";
    const style = "modern professional advertising";
    
    console.log(`Generating image with description: "${description}"`);
    
    const imageUrls = await aiService.generateAdImages(description, style);
    
    console.log('✅ Image generated successfully!');
    console.log('📷 Image URLs:', imageUrls);
    
    return imageUrls;
  } catch (error) {
    console.error('❌ Image generation failed:', error);
    throw error;
  }
}

async function testContentGeneration() {
  console.log('📝 Testing AI Content Generation...');
  
  try {
    const brief = `Product: Mango Glow Soap
Description: Natural handmade soap with mango extract for glowing skin
Target Audience: Women aged 25-40 interested in natural skincare
Key Benefits: Natural ingredients, Glowing skin, Moisturizing
Price Point: Premium but affordable`;
    
    const platform = "tiktok";
    const language = "english";
    
    console.log('Generating content for: Mango Glow Soap');
    
    const content = await aiService.generateAdContent(brief, platform, language);
    
    console.log('✅ Content generated successfully!');
    console.log('📱 Generated content:');
    console.log('Hook:', content.hook);
    console.log('Caption:', content.caption);
    console.log('Hashtags:', content.hashtags);
    console.log('Video Script:', content.videoScript);
    
    return content;
  } catch (error) {
    console.error('❌ Content generation failed:', error);
    throw error;
  }
}

async function runTests() {
  console.log('🚀 Starting AI Service Tests...\n');
  
  try {
    // Test content generation first (faster)
    await testContentGeneration();
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test image generation (slower)
    await testImageGeneration();
    
    console.log('\n🎉 All AI services working correctly!');
  } catch (error) {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}

export { testImageGeneration, testContentGeneration };