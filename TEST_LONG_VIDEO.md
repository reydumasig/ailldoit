# Testing Long Video Generation with Frame-to-Frame Continuity

## Quick Start

The development server is running on `http://localhost:8080`

## Method 1: Using the Test Script

1. **Get your campaign ID and auth token:**
   - Open your browser to `http://localhost:8080`
   - Log in and create a campaign (or use an existing one)
   - Open browser DevTools → Application → Local Storage
   - Find your auth token (or check cookies for session)

2. **Run the test script:**
   ```bash
   node test-long-video.js <campaignId> <authToken> 60
   ```
   
   Example:
   ```bash
   node test-long-video.js 1 "your-auth-token-here" 60
   ```

## Method 2: Using the UI

1. **Navigate to your campaign:**
   - Go to `http://localhost:8080`
   - Log in and select a campaign
   - Make sure the campaign has a brief

2. **Use the long video generation feature:**
   - Look for the "Generate Long Video" button or option
   - Set target duration to 60 seconds
   - Click generate

## Method 3: Using cURL

```bash
curl -X POST http://localhost:8080/api/campaigns/YOUR_CAMPAIGN_ID/generate-long-video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "targetDuration": 60,
    "platform": "instagram"
  }'
```

## What to Expect

When you generate a 60-second video:
- **8 segments** of 8 seconds each will be generated
- Each segment will reference the **last frame** of the previous segment
- All segments will be **stitched together** with smooth transitions
- Final video will be approximately **64 seconds** (8 × 8 = 64)

## Monitoring Progress

Watch the server console logs for:
- `🎬 VIDEO PROCESSING: Generating video clips with frame-to-frame continuity`
- `📸 VIDEO PROCESSING: Extracting last frame from segment X`
- `🔗 VIDEO PROCESSING: Using frame-to-frame continuity for segment X`
- `🔗 VIDEO PROCESSING: Stitching X clips into Ys video`

## Troubleshooting

### Server not responding
```bash
# Check if server is running
curl http://localhost:8080/api/health

# Restart server
npm run dev
```

### Authentication errors
- Make sure you're logged in
- Check that your auth token is valid
- Token might be in cookies (session) instead of localStorage

### Video generation fails
- Check that `GEMINI_API_KEY` is set in your `.env` file
- Verify you have enough credits
- Check server logs for detailed error messages

### FFmpeg errors
- Make sure FFmpeg is installed: `ffmpeg -version`
- On macOS: `brew install ffmpeg`
- On Linux: `sudo apt-get install ffmpeg`

## Expected Output

Success response:
```json
{
  "message": "Long video (60s) generated successfully!",
  "videoAssets": ["https://firebase-storage-url/video.mp4"],
  "duration": 64,
  "platform": "instagram"
}
```

## Testing Different Durations

- **30 seconds**: 4 segments (32s total)
- **45 seconds**: 6 segments (48s total)
- **60 seconds**: 8 segments (64s total)

Note: Duration is rounded up to the nearest 8-second multiple.

