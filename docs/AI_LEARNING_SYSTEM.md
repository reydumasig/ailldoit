# AI Learning System Documentation

## Overview

The AI Learning System enables Ailldoit to continuously improve content generation by analyzing high-performing content patterns and incorporating these insights into future AI prompts.

## Architecture Components

### 1. Performance Analytics (`contentPerformance` table)
- Tracks content performance metrics (views, likes, comments, shares, CTR, engagement rate)
- Extracts content features using AI analysis (sentiment, structure, keywords, etc.)
- Calculates composite performance scores (0-100)

### 2. Learning Patterns (`learningPatterns` table)
- Stores extracted patterns from high-performing content (score > 70)
- Tracks pattern types: structure, sentiment, length, features
- Maintains usage statistics and confidence scores

### 3. AI Prompt Optimization (`aiPromptTemplates` table)
- Stores optimized prompt templates based on learning patterns
- Version control for prompts with performance tracking
- Platform and language-specific prompt variations

### 4. Enhanced AI Service
- Uses learning patterns to build intelligent prompts
- Fallback to baseline prompts for new platforms/languages
- Continuous learning from user feedback

## Content Feature Extraction

The system analyzes content using OpenAI GPT-4 to extract:

- **Length**: Character count and categorization (short/medium/long)
- **Sentiment**: Positive, negative, or neutral tone
- **Keywords**: 3-5 important terms from content
- **Structure Pattern**: Hook-benefit-CTA, question-answer, story-lesson, etc.
- **Features**: Emojis, hashtags, numbers, questions, call-to-action

## Performance Score Calculation

Composite score (0-100) weighted by:
- Engagement Rate (40%): (likes + comments + shares) / views
- Click-Through Rate (30%): Percentage of clicks
- Conversion Rate (30%): Percentage of conversions

## Learning Pipeline Flow

1. **Content Generation**: AI generates content using optimized prompts
2. **Performance Tracking**: User publishes content and reports metrics
3. **Feature Extraction**: System analyzes high-performing content (score > 70)
4. **Pattern Storage**: Successful patterns stored in learning database
5. **Prompt Enhancement**: Future generations use successful patterns
6. **Continuous Improvement**: System gets smarter with each campaign

## API Endpoints

### Record Performance Data
```
POST /api/campaigns/:id/performance
Body: {
  contentType: "hook" | "caption" | "hashtags" | "video_script",
  contentText: string,
  metrics: {
    views: number,
    likes: number,
    comments: number,
    shares: number,
    clickThroughRate: number,
    engagementRate: number,
    conversionRate: number
  }
}
```

### Get Performance Analytics
```
GET /api/analytics/performance
Response: {
  totalContent: number,
  avgPerformanceScore: number,
  topPerformingPlatforms: Array<{platform: string, avgScore: number}>,
  recentPerformance: Array<ContentPerformance>
}
```

## Database Schema

### Content Performance Table
```sql
CREATE TABLE content_performance (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER REFERENCES campaigns(id),
  user_id VARCHAR REFERENCES users(id),
  platform VARCHAR NOT NULL,
  language VARCHAR NOT NULL,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  click_through_rate INTEGER DEFAULT 0,
  engagement_rate INTEGER DEFAULT 0,
  conversion_rate INTEGER DEFAULT 0,
  content_type VARCHAR NOT NULL,
  content_text TEXT NOT NULL,
  content_features JSONB,
  performance_score INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Learning Patterns Table
```sql
CREATE TABLE learning_patterns (
  id SERIAL PRIMARY KEY,
  platform VARCHAR NOT NULL,
  language VARCHAR NOT NULL,
  content_type VARCHAR NOT NULL,
  pattern_type VARCHAR NOT NULL,
  pattern_data JSONB NOT NULL,
  avg_performance_score INTEGER NOT NULL,
  usage_count INTEGER DEFAULT 1,
  success_rate INTEGER DEFAULT 0,
  confidence INTEGER DEFAULT 0,
  last_used TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Usage Example

1. User creates campaign and generates content with AI
2. User publishes content to social media platform
3. After campaign runs, user submits performance metrics via API
4. System extracts features and stores successful patterns
5. Next campaign generation uses improved prompts based on learned patterns

## Benefits

- **Improved Content Quality**: AI learns from successful content patterns
- **Platform Optimization**: Patterns specific to TikTok, Instagram, Facebook
- **Language Localization**: Learning patterns for each target language
- **Continuous Learning**: Performance improves with each campaign
- **Data-Driven Insights**: Analytics show what content performs best

## Implementation Status

✅ Database schema created and migrated
✅ Learning service with AI feature extraction
✅ Enhanced AI service with pattern-based prompts
✅ Performance tracking API endpoints
✅ Analytics dashboard integration
🔄 Frontend integration for performance reporting (pending)
🔄 Advanced pattern recognition algorithms (future enhancement)

## Future Enhancements

- Machine learning models for pattern recognition
- Real-time content optimization suggestions
- Automated A/B testing based on learned patterns
- Cross-platform pattern transfer learning
- Advanced sentiment and trend analysis