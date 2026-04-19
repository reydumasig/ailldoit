/**
 * Test script for long video generation with frame-to-frame continuity
 * 
 * Usage:
 * 1. Make sure the dev server is running: npm run dev
 * 2. Create a campaign first and get its ID
 * 3. Get your auth token from the browser (localStorage or cookies)
 * 4. Run: node test-long-video.js <campaignId> <authToken> [targetDuration]
 * 
 * Example:
 * node test-long-video.js 1 "your-auth-token" 60
 */

const campaignId = process.argv[2];
const authToken = process.argv[3] || 'test-token';
const targetDuration = parseInt(process.argv[4] || '60', 10);

if (!campaignId) {
  console.error('❌ Usage: node test-long-video.js <campaignId> <authToken> [targetDuration]');
  console.error('   Example: node test-long-video.js 1 "your-token" 60');
  process.exit(1);
}

const API_URL = 'http://localhost:8080';

async function testLongVideoGeneration() {
  console.log('🧪 Testing Long Video Generation with Frame-to-Frame Continuity');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📋 Campaign ID: ${campaignId}`);
  console.log(`⏱️  Target Duration: ${targetDuration} seconds`);
  console.log(`🔗 API URL: ${API_URL}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Test health endpoint first
    console.log('🏥 Step 1: Checking server health...');
    const healthResponse = await fetch(`${API_URL}/api/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Server is healthy:', healthData);
    console.log('');

    // Test long video generation
    console.log(`🎬 Step 2: Generating long video (${targetDuration}s)...`);
    console.log('   This will generate multiple 8-second segments with frame-to-frame continuity');
    console.log('   Estimated segments:', Math.ceil(targetDuration / 8));
    console.log('   This may take several minutes...\n');

    const startTime = Date.now();
    
    const response = await fetch(`${API_URL}/api/campaigns/${campaignId}/generate-long-video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        targetDuration: targetDuration,
        platform: 'instagram'
      })
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Error:', errorData);
      console.error(`   Status: ${response.status}`);
      throw new Error(`API Error: ${errorData.message || 'Unknown error'}`);
    }

    const data = await response.json();
    
    console.log('✅ Long video generation completed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`⏱️  Generation Time: ${duration} seconds`);
    console.log(`📹 Video Assets: ${data.videoAssets?.length || 0}`);
    console.log(`🎯 Duration: ${data.duration} seconds`);
    console.log(`📱 Platform: ${data.platform}`);
    console.log('');
    
    if (data.videoAssets && data.videoAssets.length > 0) {
      console.log('🔗 Video URLs:');
      data.videoAssets.forEach((url, index) => {
        console.log(`   ${index + 1}. ${url}`);
      });
    }
    
    console.log('');
    console.log('🎉 Test completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('   Make sure:');
    console.error('   1. The dev server is running (npm run dev)');
    console.error('   2. You have a valid campaign ID');
    console.error('   3. You have a valid auth token');
    console.error('   4. Your environment variables are set (GEMINI_API_KEY, etc.)');
    process.exit(1);
  }
}

testLongVideoGeneration();

