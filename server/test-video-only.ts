// Test Replicate Video Generation only
import { aiService } from './services/ai-service.js';

async function testVideoGeneration() {
  console.log('🎬 Testing Replicate Video Generation...');
  
  const prompt = "A premium mango soap bar with natural ingredients being used by a person in a clean modern bathroom";
  
  try {
    const videoUrls = await aiService.generateVideo(prompt, "modern advertising");
    
    console.log('\n🎉 Replicate video generation test completed successfully!');
    
  } catch (error) {
    console.error('❌ Video generation test failed:', error);
  }
}

testVideoGeneration();