#!/usr/bin/env tsx
import { config } from 'dotenv';
import { AIService } from './services/ai-service.js';

// Load environment variables
config();

async function testGeminiImageGeneration() {
  console.log('🧪 Testing Gemini Image Generation');
  console.log('=================================');

  const aiService = new AIService();

  try {
    // Test 1: Check if Gemini API key is available
    if (!process.env.GEMINI_API_KEY) {
      console.log('❌ GEMINI_API_KEY not found in environment');
      return;
    }
    console.log('✅ Gemini API key found');

    // Test 2: Generate a simple product image
    console.log('\n🖼️  Testing Gemini image generation...');
    const imageDescription = "Premium skincare cream jar with natural ingredients for glowing skin";
    
    const startTime = Date.now();
    const imageUrls = await aiService.generateAdImagesGemini(imageDescription, "modern advertising");
    const duration = (Date.now() - startTime) / 1000;

    console.log(`\n⏱️  Generation took ${duration} seconds`);
    
    if (imageUrls && imageUrls.length > 0) {
      console.log('✅ Gemini image generation successful!');
      console.log(`📊 Generated ${imageUrls.length} image(s):`);
      imageUrls.forEach((url, index) => {
        console.log(`   ${index + 1}. ${url.substring(0, 50)}...`);
      });
    } else {
      console.log('❌ No images generated');
    }

    // Test 3: Compare with main method
    console.log('\n🔄 Testing main generateAdImages method...');
    const mainImageUrls = await aiService.generateAdImages(imageDescription, "cinematic");
    
    if (mainImageUrls && mainImageUrls.length > 0) {
      console.log('✅ Main image generation method working!');
      console.log(`📊 Generated ${mainImageUrls.length} image(s):`);
      mainImageUrls.forEach((url, index) => {
        console.log(`   ${index + 1}. ${url.substring(0, 50)}...`);
      });
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Error details:', error instanceof Error ? error.message : String(error));
  }
}

// Run the test
testGeminiImageGeneration().then(() => {
  console.log('\n🎯 Test completed');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Test crashed:', error);
  process.exit(1);
});