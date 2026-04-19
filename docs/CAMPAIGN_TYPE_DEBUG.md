# Campaign Type Debug Guide

## Issue
Campaign 88 is still generating short videos even when "Long Video Content" is selected.

## Possible Causes

### 1. Changes Not Deployed to Staging
**Status:** ✅ Changes are committed but may not be deployed
**Solution:** Run `./deploy-feature-staging.sh` to deploy latest changes

### 2. Campaign Created Before Changes
**Status:** ⚠️ Campaign 88 may have been created with old `campaignType` value
**Solution:** 
- Check campaign type in database: `SELECT campaign_type FROM campaigns WHERE id = 88;`
- If it's `'video'` or `'shortVideo'`, update it: `UPDATE campaigns SET campaign_type = 'longVideo' WHERE id = 88;`
- Or create a new campaign with "Long Video Content" selected

### 3. Frontend Not Saving Campaign Type
**Status:** ✅ Code looks correct - `campaignType: selectedCampaignType` is set
**Check:** 
- Open browser DevTools → Network tab
- Create a campaign and check the POST request payload
- Verify `campaignType` is `"longVideo"` in the request

### 4. Backend Not Reading Campaign Type
**Status:** ✅ Code checks for `campaign.campaignType === 'longVideo'`
**Check:** 
- Check Cloud Run logs after generation attempt
- Look for: `🔍 ROUTE DEBUG: Campaign Type: "..."`
- Verify the logged type matches what was selected

## Debug Steps

### Step 1: Check Staging Deployment
```bash
# Check if latest commit is deployed
gcloud run services describe ailldoit-staging \
  --region us-central1 \
  --format "value(spec.template.spec.containers[0].image)"
```

### Step 2: Check Campaign Type in Database
```sql
-- Connect to your database and run:
SELECT id, name, campaign_type, brief 
FROM campaigns 
WHERE id = 88;
```

### Step 3: Check Cloud Run Logs
```bash
# After attempting generation, check logs:
gcloud run services logs read ailldoit-staging \
  --region us-central1 \
  --limit 100 \
  | grep "ROUTE DEBUG\|Campaign Type"
```

### Step 4: Verify Frontend
1. Open browser DevTools (F12)
2. Go to Network tab
3. Create a new campaign with "Long Video Content" selected
4. Check the POST `/api/campaigns` request
5. Verify `campaignType: "longVideo"` in the payload

## Expected Behavior

### When `campaignType = 'longVideo'`:
- ✅ Should see log: `🎬 ROUTE: Generating long video for campaign type: longVideo`
- ✅ Should call: `aiService.generateLongAdVideos()`
- ✅ Should generate 60-second video with Veo 3.1 features

### When `campaignType = 'shortVideo'` or `'video'`:
- ✅ Should see log: `🎬 ROUTE: Generating short video (8 seconds)`
- ✅ Should call: `aiService.generateAdVideos()`
- ✅ Should generate 8-second video

## Quick Fix

If campaign 88 was created before the changes:

1. **Option A: Update existing campaign**
   ```sql
   UPDATE campaigns 
   SET campaign_type = 'longVideo' 
   WHERE id = 88;
   ```

2. **Option B: Create new campaign**
   - Go to campaign creation page
   - Select "Long Video Content"
   - Create and generate

3. **Option C: Redeploy**
   ```bash
   ./deploy-feature-staging.sh
   ```

## Verification

After fixing, verify:
1. Campaign type is `'longVideo'` in database
2. Logs show: `🎬 ROUTE: Generating long video for campaign type: longVideo`
3. Generated video is 60 seconds (or detected duration from script)

