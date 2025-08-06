#!/usr/bin/env tsx
import { config } from 'dotenv';
import { AIService } from './services/ai-service.js';

// Load environment variables
config();

async function testVeoVideoGeneration() {
  console.log('🧪 Testing Veo 2 Video Generation');
  console.log('==================================');

  const aiService = new AIService();

  try {
    // Test 1: Check if Gemini API key is available
    if (!process.env.GEMINI_API_KEY) {
      console.log('❌ GEMINI_API_KEY not found in environment');
      return;
    }
    console.log('✅ Gemini API key found');

    // Test 2: Generate a simple product video
    console.log('\n📹 Testing Veo 2 video generation...');
    const videoDescription = "Premium skincare cream with natural ingredients for glowing skin";
    
    const startTime = Date.now();
    const videoUrls = await aiService.generateAdVideosVeo(videoDescription, "modern advertising");
    const duration = (Date.now() - startTime) / 1000;

    console.log(`\n⏱️  Generation took ${duration} seconds`);
    
    if (videoUrls && videoUrls.length > 0) {
      console.log('✅ Veo 2 video generation successful!');
      console.log(`📊 Generated ${videoUrls.length} video(s):`);
      videoUrls.forEach((url, index) => {
        console.log(`   ${index + 1}. ${url}`);
      });
    } else {
      console.log('❌ No videos generated');
    }

    // Test 3: Compare with main method
    console.log('\n🔄 Testing main generateAdVideos method...');
    const mainVideoUrls = await aiService.generateAdVideos(videoDescription, "cinematic");
    
    if (mainVideoUrls && mainVideoUrls.length > 0) {
      console.log('✅ Main video generation method working!');
      console.log(`📊 Generated ${mainVideoUrls.length} video(s):`);
      mainVideoUrls.forEach((url, index) => {
        console.log(`   ${index + 1}. ${url}`);
      });
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Error details:', error instanceof Error ? error.message : String(error));
  }
}

// Run the test
testVeoVideoGeneration().then(() => {
  console.log('\n🎯 Test completed');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Test crashed:', error);
  process.exit(1);
});