# Fix: API Quota Error Handling

## Issue Identified

From the logs, the real problem is:
1. ✅ Long video generation IS working correctly (trying to generate 8 segments)
2. ❌ All 8 segments fail with **429 (Quota Exceeded)** error
3. ❌ System falls back to short video generation (8 seconds)
4. ❌ Generated video has no sound

## Root Cause

**Gemini API Quota Exceeded:**
```
ApiError: {"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details."}}
```

The system was trying to generate 8 segments in rapid succession, hitting the API rate limit/quota, and then falling back to a single 8-second video.

## Fixes Implemented

### 1. Retry Logic with Exponential Backoff
- Added 3 retry attempts for quota/rate limit errors
- Retry delays: 5s, 15s, 30s
- Only retries on 429/quota errors, not other errors

### 2. Better Error Handling
- Detects quota errors early
- Stops segment generation if quota is exceeded
- Shows clear error message instead of falling back to short video

### 3. Improved Logging
- Logs retry attempts
- Logs quota errors clearly
- Shows how many segments were generated before failure

## How It Works Now

### Before (Old Behavior):
1. Try to generate segment 1 → 429 error
2. Try to generate segment 2 → 429 error
3. ... (all 8 segments fail)
4. Fallback to short video → generates 8-second video

### After (New Behavior):
1. Try to generate segment 1 → 429 error
2. Wait 5 seconds, retry → 429 error
3. Wait 15 seconds, retry → 429 error
4. Wait 30 seconds, retry → 429 error
5. **Stop and show error:** "API quota exceeded. Cannot generate long video."

## Error Messages

### Quota Exceeded:
```
API quota exceeded. Cannot generate long video. 
Please check your Gemini API quota and billing settings at https://ai.dev/usage?tab=rate-limit.
```

### Partial Generation:
```
API quota exceeded while generating segment 3/8. 
Please check your Gemini API quota and billing. 
Generated 2 segments before quota limit.
```

## Next Steps

### 1. Check API Quota
Visit: https://ai.dev/usage?tab=rate-limit

### 2. Upgrade Plan (if needed)
- Check current quota limits
- Upgrade to higher tier if needed
- Enable billing if not already enabled

### 3. Add Rate Limiting
Consider adding delays between segment generations to avoid hitting rate limits:
- Add 2-3 second delay between segments
- Batch segments if possible
- Use queue system for video generation

### 4. Monitor Usage
- Track API usage
- Set up alerts for quota limits
- Implement usage tracking in the app

## Testing

After deploying, test with:
1. Campaign with long video script
2. Should show clear error if quota is exceeded
3. Should retry 3 times before failing
4. Should NOT fallback to short video on quota error

## Future Improvements

1. **Queue System:** Queue video generation requests to avoid rate limits
2. **Rate Limiting:** Add delays between segment generations
3. **Quota Monitoring:** Track and display quota usage to users
4. **Graceful Degradation:** Generate fewer segments if quota is low
5. **Background Processing:** Process long videos in background jobs

