# Campaign 91 Diagnosis: Short Video + No Sound

## Issue Summary
Campaign 91 is still generating:
- ❌ Short videos (8 seconds) instead of long videos
- ❌ No sound in generated videos

## Root Cause Analysis

### Issue 1: Short Video Generation

**Possible Causes:**

1. **Campaign Type Not Set Correctly**
   - Campaign might have `campaignType = 'video'` (old type)
   - Campaign might have `campaignType = 'shortVideo'` (wrong type)
   - Auto-fix might not be running or not detecting correctly

2. **Changes Not Deployed**
   - Latest commit `49c8ffd` might not be deployed to staging
   - Auto-fix logic might not be active

3. **Brief Detection Failing**
   - Auto-fix checks for indicators like `'0:'`, `'scene'`, `'minute'`
   - If brief doesn't match, it defaults to `'shortVideo'`

### Issue 2: No Sound

**Possible Causes:**

1. **Veo 3.0/3.1 Not Generating Audio**
   - Veo models might not include audio in generated videos
   - Audio might be lost during download

2. **FFmpeg Processing Losing Audio**
   - Audio track might be missing from input videos
   - FFmpeg filter complex might be failing for audio

3. **Model Version Issue**
   - Code uses `veo-3.0-generate-preview` for short videos
   - Code uses `veo-3.1-generate-preview` for long videos
   - Both might not include audio

## Debug Checklist

### ✅ Check 1: Campaign Type in Database
```sql
SELECT id, name, campaign_type, brief 
FROM campaigns 
WHERE id = 91;
```

**Expected:** `campaign_type = 'longVideo'`

**If wrong:** Update it:
```sql
UPDATE campaigns 
SET campaign_type = 'longVideo' 
WHERE id = 91;
```

### ✅ Check 2: Cloud Run Logs
```bash
gcloud run services logs read ailldoit-staging \
  --region us-central1 \
  --limit 500 \
  | grep -E 'ROUTE DEBUG|Campaign Type|Generating|VIDEO PROCESSING|audio|Campaign ID.*91' \
  | tail -100
```

**Look for:**
- `🔍 ROUTE DEBUG: Campaign Type: "..."`
- `🔄 ROUTE DEBUG: Auto-updating campaign type...`
- `🎬 ROUTE: Generating long video...` OR `🎬 ROUTE: Generating short video...`
- `🔊 VIDEO PROCESSING: Audio check results...`

### ✅ Check 3: Deployment Status
```bash
gcloud run services describe ailldoit-staging \
  --region us-central1 \
  --format 'value(spec.template.spec.containers[0].image)'
```

**Verify:** Latest image includes commit `49c8ffd`

### ✅ Check 4: Code Logic Verification

**In `server/routes.ts` line 478-502:**
- ✅ Should check `if (campaign.campaignType === 'longVideo')`
- ✅ Should call `aiService.generateLongAdVideos()`
- ✅ Should NOT call `aiService.generateAdVideos()` for long videos

**In `server/services/ai-service.ts` line 578:**
- ⚠️ Short videos use `veo-3.0-generate-preview` (might not have audio)
- ✅ Long videos use `veo-3.1-generate-preview` (should have audio)

## Expected Behavior

### When Campaign Type is 'longVideo':

1. **Route Handler (`server/routes.ts`):**
   ```
   🔍 ROUTE DEBUG: Campaign Type: "longVideo"
   🎬 ROUTE: Generating long video for campaign type: longVideo
   🎬 ROUTE: Final target duration for long video: 60s
   ```

2. **AI Service (`server/services/ai-service.ts`):**
   ```
   🎬 Starting long video generation with frame-to-frame continuity
   📊 Will generate 8 segments of 8 seconds each (total: 60s)
   ```

3. **Video Processing (`server/services/video-processing-service.ts`):**
   ```
   🔊 VIDEO PROCESSING: Audio check results: [true, true, true, ...]
   🔗 Stitching 8 clips into 60s video...
   ```

## Quick Fixes

### Fix 1: Update Campaign Type Manually
```sql
UPDATE campaigns 
SET campaign_type = 'longVideo' 
WHERE id = 91;
```

### Fix 2: Redeploy Latest Changes
```bash
./deploy-feature-staging.sh
```

### Fix 3: Create New Campaign
1. Go to campaign creation
2. Select "Long Video Content" (Film icon)
3. Create and generate
4. Should work correctly

## Audio Issue Investigation

### Check if Veo Generates Audio:
1. Download a generated video segment
2. Check with FFmpeg:
   ```bash
   ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,codec_type input.mp4
   ```
3. If no audio stream, Veo is not generating audio

### Potential Solutions:
1. **Add Background Music:** Use FFmpeg to add music during stitching
2. **Request Audio in Prompt:** Update prompts to explicitly request audio
3. **Post-Process Audio:** Generate audio separately and merge

## Next Steps

1. **Check Cloud Run Logs** - See what's actually happening
2. **Verify Campaign Type** - Ensure it's set to 'longVideo'
3. **Check Deployment** - Ensure latest code is deployed
4. **Test Audio Generation** - Check if Veo is generating audio at all
5. **Implement Audio Fallback** - Add background music if Veo doesn't generate audio

