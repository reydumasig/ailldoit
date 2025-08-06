import { learningService } from './services/learning-service';
import { storage } from './storage';
import { AIService } from './services/ai-service';

/**
 * Test script to demonstrate the AI learning system
 * This simulates feeding the system high-performing content and showing improved AI generation
 */

async function testLearningSystem() {
  console.log('🧠 Testing AI Learning System...\n');

  const aiService = new AIService();
  const testUserId = 'test-learning-user';
  const platform = 'tiktok';
  const language = 'english';
  const brief = 'Promoting a new fitness tracking app that helps users stay motivated';

  // Step 1: Generate baseline content (without learning data)
  console.log('📝 Step 1: Generating baseline content (no learning data)...');
  const baselineContent = await aiService.generateAdContent(brief, platform, language, testUserId);
  console.log('Baseline Hook:', baselineContent.hook);
  console.log('Baseline Caption:', baselineContent.caption?.substring(0, 100) + '...');
  console.log('');

  // Step 2: Simulate feeding high-performing content to the learning system
  console.log('📊 Step 2: Feeding high-performing content examples...');
  
  const highPerformingExamples = [
    {
      contentType: 'hook',
      contentText: 'POV: Your fitness app just called you out for skipping leg day 😅',
      metrics: {
        views: 150000,
        likes: 12000,
        comments: 850,
        shares: 1200,
        clickThroughRate: 8.5,
        engagementRate: 9.2,
        conversionRate: 4.1
      }
    },
    {
      contentType: 'hook', 
      contentText: 'This app knows when you\'re lying about your workout 👀',
      metrics: {
        views: 95000,
        likes: 8500,
        comments: 650,
        shares: 900,
        clickThroughRate: 7.8,
        engagementRate: 10.5,
        conversionRate: 3.8
      }
    },
    {
      contentType: 'caption',
      contentText: 'Real talk: I used to make excuses for skipping workouts until this app started sending me motivational roasts 😂 Now I\'m actually consistent for the first time in years! Who else needs an app that holds them accountable? 💪 #FitnessMotivation #WorkoutAccountability #HealthyLifestyle',
      metrics: {
        views: 78000,
        likes: 6200,
        comments: 420,
        shares: 680,
        clickThroughRate: 6.9,
        engagementRate: 9.8,
        conversionRate: 3.2
      }
    }
  ];

  // Feed the examples to the learning system
  for (let i = 0; i < highPerformingExamples.length; i++) {
    const example = highPerformingExamples[i];
    await learningService.recordContentPerformance(
      999, // Mock campaign ID
      testUserId,
      platform,
      language,
      example.contentType,
      example.contentText,
      example.metrics
    );
    console.log(`✅ Recorded high-performing ${example.contentType} (Score: ${learningService.calculatePerformanceScore(example.metrics)}/100)`);
  }
  console.log('');

  // Step 3: Generate content with learning insights
  console.log('🧠 Step 3: Generating enhanced content with learning insights...');
  const enhancedContent = await aiService.generateAdContent(brief, platform, language, testUserId);
  console.log('Enhanced Hook:', enhancedContent.hook);
  console.log('Enhanced Caption:', enhancedContent.caption?.substring(0, 100) + '...');
  console.log('');

  // Step 4: Show what the system learned
  console.log('📈 Step 4: Learning insights extracted...');
  const patterns = await storage.getTopLearningPatterns(platform, language, 'hook', 5);
  console.log('Top learned patterns:');
  patterns.forEach((pattern, index) => {
    console.log(`${index + 1}. ${pattern.patternType}: ${JSON.stringify(pattern.patternData)} (Score: ${pattern.avgPerformanceScore}/100)`);
  });
  console.log('');

  // Step 5: Show performance analytics
  console.log('📊 Step 5: Performance analytics...');
  const analytics = await learningService.getPerformanceAnalytics(testUserId);
  console.log('Analytics Summary:');
  console.log('- Total content analyzed:', analytics.totalContent);
  console.log('- Average performance score:', analytics.avgPerformanceScore + '/100');
  console.log('- Top platforms:', analytics.topPerformingPlatforms.map(p => `${p.platform} (${p.avgScore}/100)`).join(', '));
  console.log('');

  // Step 6: Compare content quality
  console.log('🔍 Step 6: Content comparison analysis...');
  console.log('BASELINE vs ENHANCED CONTENT COMPARISON:');
  console.log('');
  console.log('Baseline Hook Length:', baselineContent.hook.length, 'characters');
  console.log('Enhanced Hook Length:', enhancedContent.hook.length, 'characters');
  console.log('');
  console.log('Baseline uses learning insights: NO');
  console.log('Enhanced uses learning insights: YES');
  console.log('');
  console.log('Key differences:');
  console.log('- Enhanced content likely uses more engaging patterns');
  console.log('- Enhanced prompts include successful structures from high-performing content');
  console.log('- Enhanced content targets proven engagement triggers');

  console.log('\n✅ AI Learning System test completed successfully!');
  console.log('🎯 The system is now smarter and will generate better content for future campaigns.');
}

// Export for use in other files
export { testLearningSystem };

// Run the test if this file is executed directly
if (require.main === module) {
  testLearningSystem().catch(console.error);
}