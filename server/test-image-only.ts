// Test script for Replicate image generation only
import { aiService } from './services/ai-service.js';

async function testImageGeneration() {
  console.log('🎨 Testing Replicate Image Generation...');
  
  try {
    const description = "A premium mango soap bar with natural ingredients, clean white background, professional product photography";
    const style = "modern advertising";
    
    console.log(`Generating image: "${description}"`);
    console.log('Style:', style);
    console.log('⏳ This may take 30-60 seconds...\n');
    
    const startTime = Date.now();
    const imageUrls = await aiService.generateAdImages(description, style);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`✅ Image generated successfully in ${duration}s!`);
    console.log('📷 Generated image URLs:');
    imageUrls.forEach((url, index) => {
      console.log(`   ${index + 1}. ${url}`);
    });
    
    return imageUrls;
  } catch (error) {
    console.error('❌ Image generation failed:', error);
    throw error;
  }
}

// Run the test
testImageGeneration()
  .then(() => {
    console.log('\n🎉 Replicate image generation test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error.message);
    process.exit(1);
  });