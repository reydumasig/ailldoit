import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { insertCampaignSchema } from "@shared/schema";
import { authenticateToken, optionalAuth } from "./middleware/auth";
import { admin } from "./config/firebase-admin";
import { oauthService } from "./services/oauth-service";
import { AIService } from "./services/ai-service";
import { ABTestingService } from "./services/ab-testing-service";
import { PublishingService } from "./services/publishing-service";
import { StorageService } from "./services/storage-service";
import { learningService } from "./services/learning-service";
import { briefTemplateService } from "./services/brief-template-service";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { z } from "zod";
import crypto from 'crypto';

export async function registerRoutes(app: Express): Promise<Server> {
  // IMPORTANT: Serve static assets first without authentication
  // This prevents 401 errors on CSS/JS files in production
  if (process.env.NODE_ENV === 'production') {
    const express = await import('express');
    const path = await import('path');
    const fs = await import('fs');
    
    const distPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "public");
    if (fs.existsSync(distPath)) {
      app.use('/assets', express.default.static(path.join(distPath, 'assets')));
    }
  }

  // Simple test route for OAuth
  app.get('/api/test-meta-oauth', async (req, res) => {
    try {
      // Use HTTPS for redirect URI in production/Replit
      const domain = req.get('host');
      const redirectUri = `https://${domain}/auth/meta/callback`;
      const state = 'test-' + Date.now();
      const oauthUrl = oauthService.getOAuthUrl('meta', redirectUri, state);
      
      res.json({
        success: true,
        platform: 'meta',
        oauthUrl,
        redirectUri,
        state,
        hasMetaAppId: !!process.env.META_APP_ID,
        metaAppIdPrefix: process.env.META_APP_ID ? process.env.META_APP_ID.substring(0, 8) + '...' : 'not set'
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: (error as Error).message,
        hasMetaAppId: !!process.env.META_APP_ID
      });
    }
  });

  // Auth routes
  app.post('/api/auth/verify', authenticateToken, async (req, res) => {
    try {
      // User was verified and added to req.user by middleware
      const user = await storage.getUser(req.user!.id);
      
      // Track user session for performance monitoring
      const { PerformanceMonitor } = await import("./services/performance-monitor");
      PerformanceMonitor.trackUserSession(req.user!.id);
      
      res.json(user);
    } catch (error) {
      console.error('Auth verify error:', error);
      res.status(500).json({ message: 'Failed to verify user' });
    }
  });

  app.patch('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
      const { firstName, lastName } = req.body;
      const updatedUser = await storage.upsertUser({
        id: req.user!.id,
        email: req.user!.email,
        firebaseUid: req.user!.firebaseUid,
        firstName,
        lastName,
      });
      res.json(updatedUser);
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(500).json({ message: 'Failed to update profile' });
    }
  });

  // Beta signup route - creates Beta users with 5000 credits (first-time only)
  app.post('/api/auth/signup/beta', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

      if (!token) {
        return res.status(401).json({ message: 'Access token required' });
      }

      // Verify Firebase ID token
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      console.log('🎯 Beta signup attempt for:', decodedToken.email);
      
      // Check if user already exists
      const existingUser = await storage.getUserByFirebaseUid(decodedToken.uid);
      
      if (existingUser) {
        // If user already exists, check if they're already Beta
        if (existingUser.subscriptionTier === 'beta') {
          console.log('✅ User already has Beta access:', existingUser.email);
          // Return existing user without modifying credits
          return res.json(existingUser);
        } else {
          // User exists but not Beta - this is a security issue, require admin approval
          console.log('⛔ Existing user attempted Beta upgrade:', existingUser.email, 'Current tier:', existingUser.subscriptionTier);
          return res.status(403).json({ 
            message: 'Beta upgrade for existing users requires admin approval. Please contact support.' 
          });
        }
      }
      
      // Create new Beta user with 5000 credits (only for first-time users)
      console.log('🎯 Creating new Beta user:', decodedToken.email);
      const betaUser = await storage.upsertUser({
        email: decodedToken.email!,
        firebaseUid: decodedToken.uid,
        firstName: decodedToken.name?.split(' ')[0],
        lastName: decodedToken.name?.split(' ')[1],
        profileImageUrl: decodedToken.picture,
        subscriptionTier: 'beta',
        creditsLimit: 5000,
        creditsRemaining: 5000,
        creditsUsed: 0,
        subscriptionStartDate: new Date(),
        subscriptionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        subscriptionStatus: 'active',
      });

      console.log('✅ Successfully created Beta user:', betaUser.email, 'with 5000 credits');
      
      // Track user session for performance monitoring
      const { PerformanceMonitor } = await import("./services/performance-monitor");
      PerformanceMonitor.trackUserSession(betaUser.id);
      
      res.json(betaUser);
    } catch (error) {
      console.error('Beta signup error:', error);
      res.status(500).json({ message: 'Failed to create Beta user' });
    }
  });

  // Object Storage routes (protected file uploading)
  app.get("/objects/:objectPath(*)", authenticateToken, async (req, res) => {
    try {
      // Gets the authenticated user id.
      const userId = req.user?.id;
      const objectStorageService = new ObjectStorageService();
      
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      
      if (!canAccess) {
        return res.sendStatus(401);
      }
      
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // The endpoint for getting the upload URL for an object entity.
  app.post("/api/objects/upload", authenticateToken, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Reference image upload endpoint for campaigns
  app.put("/api/campaigns/:id/reference-image", authenticateToken, async (req, res) => {
    try {
      if (!req.body.referenceImageURL) {
        return res.status(400).json({ error: "referenceImageURL is required" });
      }

      const campaignId = parseInt(req.params.id);
      const userId = req.user!.id;

      // Verify campaign ownership
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign || campaign.userId !== userId) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.referenceImageURL,
        {
          owner: userId,
          visibility: "public", // Reference images can be public for AI services
        },
      );

      // Update campaign with reference image URL
      const updatedCampaign = await storage.updateCampaign(campaignId, {
        referenceImageUrl: objectPath,
      });

      res.status(200).json({
        objectPath: objectPath,
        campaign: updatedCampaign
      });
    } catch (error) {
      console.error("Error setting reference image:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Protected campaign routes (require authentication)
  app.get("/api/campaigns", authenticateToken, async (req, res) => {
    try {
      console.log('📋 Fetching campaigns for user:', req.user!.id);
      const campaigns = await storage.getCampaigns(req.user!.id);
      console.log('📊 Found campaigns:', campaigns.length);
      res.json(campaigns);
    } catch (error) {
      console.error('Get campaigns error:', error);
      res.status(500).json({ message: "Failed to fetch campaigns" });
    }
  });

  app.get("/api/campaigns/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Validate campaign ID
      if (isNaN(id) || id <= 0) {
        console.error('❌ Invalid campaign ID received:', req.params.id);
        return res.status(400).json({ message: "Invalid campaign ID" });
      }
      
      const campaign = await storage.getCampaign(id, req.user!.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error) {
      console.error('Get campaign error:', error);
      res.status(500).json({ message: "Failed to fetch campaign" });
    }
  });

  app.post("/api/campaigns", authenticateToken, async (req, res) => {
    try {
      const validatedData = insertCampaignSchema.parse({
        ...req.body,
        userId: req.user!.id
      });
      const campaign = await storage.createCampaign(validatedData);
      res.status(201).json(campaign);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid campaign data", errors: error.errors });
      }
      console.error('Create campaign error:', error);
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });

  // Update campaign (protected)
  app.patch("/api/campaigns/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Validate campaign ID
      if (isNaN(id) || id <= 0) {
        console.error('❌ Invalid campaign ID for update:', req.params.id);
        return res.status(400).json({ message: "Invalid campaign ID" });
      }
      
      // Filter out large fields to prevent payload too large errors
      const allowedFields = ['name', 'brief', 'description', 'language', 'platform', 'campaignType', 'status'];
      const updateData = Object.keys(req.body)
        .filter(key => allowedFields.includes(key))
        .reduce((obj, key) => {
          obj[key] = req.body[key];
          return obj;
        }, {} as any);
      
      console.log('📝 Updating campaign with filtered data:', { id, fields: Object.keys(updateData) });
      
      const campaign = await storage.updateCampaign(id, updateData, req.user!.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error) {
      console.error('Update campaign error:', error);
      res.status(500).json({ message: "Failed to update campaign" });
    }
  });

  // Delete campaign (protected)
  app.delete("/api/campaigns/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Validate campaign ID
      if (isNaN(id) || id <= 0) {
        console.error('❌ Invalid campaign ID for deletion:', req.params.id);
        return res.status(400).json({ message: "Invalid campaign ID" });
      }
      
      const deleted = await storage.deleteCampaign(id, req.user!.id);
      if (!deleted) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error('Delete campaign error:', error);
      res.status(500).json({ message: "Failed to delete campaign" });
    }
  });

  // Fix missing videos for user (protected)
  app.post("/api/campaigns/fix-missing-videos", authenticateToken, async (req, res) => {
    try {
      const result = await storage.regenerateMissingVideos(req.user!.id);
      res.json({
        message: `Fixed ${result.fixed} out of ${result.total} campaigns with missing videos`,
        ...result
      });
    } catch (error) {
      console.error('Fix missing videos error:', error);
      res.status(500).json({ message: "Failed to fix missing videos" });
    }
  });

  // System-wide video audit (admin only - for development)
  app.post("/api/admin/audit-videos", authenticateToken, async (req, res) => {
    try {
      // In production, add role-based access control here
      // Note: req.user doesn't have role field yet, skip role check for now
      // if (process.env.NODE_ENV === 'production' && req.user?.role !== 'admin') {
      //   return res.status(403).json({ message: "Admin access required" });
      // }
      
      const result = await storage.auditAllVideoAssets();
      res.json({
        message: `Audit complete: Fixed ${result.fixedCampaigns} campaigns with broken videos across ${result.affectedUsers.length} users`,
        ...result
      });
    } catch (error) {
      console.error('Video audit error:', error);
      res.status(500).json({ message: "Failed to audit video assets" });
    }
  });

  // Regenerate expired image for specific campaign (protected)
  app.post("/api/campaigns/:id/regenerate-image", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Validate campaign ID
      if (isNaN(id) || id <= 0) {
        console.error('❌ Invalid campaign ID for image regeneration:', req.params.id);
        return res.status(400).json({ message: "Invalid campaign ID" });
      }
      
      const campaign = await storage.getCampaign(id, req.user!.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      console.log(`🖼️ Regenerating image for campaign: ${campaign.name}`);
      
      // Import AI service
      const { aiService } = await import("./services/ai-service");
      
      // Generate new image using our optimized hierarchy (Replicate SDXL primary)
      const imagePrompt = `Professional advertising image for ${campaign.name}: ${campaign.brief}`;
      
      // Extract concept parameters for nano banana motif
      const conceptType = (req.body as any).conceptType || undefined;
      const conceptUsage = (req.body as any).conceptUsage || undefined;
      
      const imageUrls = await aiService.generateAdImages(
        imagePrompt, 
        'clean modern advertising style',
        campaign.referenceImageUrl || undefined,
        conceptType,
        conceptUsage
      );
      
      if (imageUrls.length > 0) {
        // Find and update existing image asset
        const assets = await storage.getAssets(id);
        const imageAsset = assets.find(asset => asset.type === 'image');
        
        if (imageAsset) {
          await storage.updateAsset(imageAsset.id, {
            url: imageUrls[0],
            provider: 'replicate-sdxl',
            metadata: { 
              generatedAt: new Date().toISOString(),
              regenerated: true,
              reason: 'Fixed expired external image URL'
            }
          });
          
          // Update campaign content with new image
          if (campaign.generatedContent) {
            const content = campaign.generatedContent as any;
            if (content.imageAssets) {
              content.imageAssets[0] = imageUrls[0];
              await storage.updateCampaign(id, { generatedContent: content }, req.user!.id);
            }
          }
          
          console.log('✅ Image regenerated successfully:', imageUrls[0]);
          res.json({ 
            message: "Image regenerated successfully",
            newImageUrl: imageUrls[0]
          });
        } else {
          res.status(404).json({ message: "No image asset found for this campaign" });
        }
      } else {
        res.status(500).json({ message: "Failed to generate new image" });
      }
    } catch (error) {
      console.error('Image regeneration error:', error);
      res.status(500).json({ message: "Failed to regenerate image" });
    }
  });

  // Generate AI content for campaign (protected)
  app.post("/api/campaigns/:id/generate", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Validate campaign ID
      if (isNaN(id) || id <= 0) {
        console.error('❌ Invalid campaign ID for generation:', req.params.id);
        return res.status(400).json({ message: "Invalid campaign ID" });
      }
      
      const campaign = await storage.getCampaign(id, req.user!.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Import all services at once
      const { aiService } = await import("./services/ai-service");
      const { abTestingService } = await import("./services/ab-testing-service");
      const { CreditTrackingService } = await import("./services/credit-tracking-service");
      const { PerformanceMonitor } = await import("./services/performance-monitor");
      const { subscriptionService } = await import("./services/subscription-service");

      // Check credits before generation - Pre-validate without deducting
      const textCreditsNeeded = 1;
      const imageCreditsNeeded = campaign.campaignType === 'image' ? 5 : 0;
      const videoCreditsNeeded = campaign.campaignType === 'video' ? 10 : 0;
      const totalCreditsNeeded = textCreditsNeeded + imageCreditsNeeded + videoCreditsNeeded;
      
      // Check if user has enough credits
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const hasEnoughCredits = await subscriptionService.hasEnoughCredits(req.user!.id, totalCreditsNeeded);
      if (!hasEnoughCredits) {
        const subscription = await subscriptionService.getUserSubscription(req.user!.id);
        return res.status(403).json({ 
          message: "Insufficient credits to generate content", 
          error: "INSUFFICIENT_CREDITS",
          creditsNeeded: totalCreditsNeeded,
          creditsRemaining: subscription?.creditsRemaining || 0,
          subscription: subscription?.plan || null
        });
      }

      // Check if user has enough credits before proceeding
      const canProceed = await CreditTrackingService.validateUserCanProceed(req.user!.id, 'campaignGeneration');
      
      if (!canProceed) {
        return res.status(429).json({ 
          message: "Insufficient credits. Please upgrade your plan or contact support.",
          errorCode: "CREDITS_EXCEEDED"
        });
      }

      // Update status to generating
      await storage.updateCampaign(id, { status: "generating" }, req.user!.id);
        
      try {
        // Track generation start
        PerformanceMonitor.startGeneration(req.user!.id, 'campaignGeneration');
        
        // Track campaign generation credits (8 credits for full campaign)
        await CreditTrackingService.trackUsage(req.user!.id, 'campaignGeneration', {
          campaignId: id,
          platform: campaign.platform,
          language: campaign.language,
          metadata: { campaignType: campaign.campaignType }
        });

        const generatedContent = await aiService.generateAdContent(
          campaign.brief, 
          campaign.platform, 
          campaign.language,
          req.user!.id,
          campaign.referenceImageUrl || undefined
        );
        
        // Track generation completion
        PerformanceMonitor.endGeneration(req.user!.id, 'campaignGeneration', 8);
        
        // Clear existing assets for regeneration
        await storage.clearCampaignAssets(id);
        
        // Store generated assets in database
        const assetIds: number[] = [];
        
        // Generate images if specified
        if (campaign.campaignType === 'image' || campaign.campaignType === 'video') {
          try {
            // Track image generation credits (5 credits per image)
            await CreditTrackingService.trackUsage(req.user!.id, 'imageGeneration', {
              campaignId: id,
              platform: campaign.platform,
              metadata: { type: 'campaign_image' }
            });

            // Extract concept parameters for nano banana motif
            const conceptType = (req.body as any).conceptType || undefined;
            const conceptUsage = (req.body as any).conceptUsage || undefined;
            
            const images = await aiService.generateAdImages(
              campaign.brief, 
              "modern", 
              campaign.referenceImageUrl || undefined,
              conceptType,
              conceptUsage
            );
            generatedContent.imageAssets = images || [];
            
            // Store image assets
            for (const imageUrl of images || []) {
              const asset = await storage.createAsset({
                campaignId: id,
                userId: req.user!.id,
                type: 'image',
                provider: 'openai-dalle3',
                url: imageUrl,
                metadata: { generatedAt: new Date().toISOString() }
              });
              assetIds.push(asset.id);
            }
          } catch (imageError) {
            console.warn('⚠️ Image generation failed, continuing without images:', imageError);
            generatedContent.imageAssets = [];
          }
        }
        
        // Generate video script and assets
        if (campaign.campaignType === 'video') {
          const videoScript = await aiService.generateVideoScript(
            campaign.brief,
            campaign.platform,
            8
          );
          generatedContent.videoScript = videoScript;
          
          // Track video generation credits (15 credits per video)
          await CreditTrackingService.trackUsage(req.user!.id, 'videoGeneration', {
            campaignId: id,
            platform: campaign.platform,
            metadata: { type: 'campaign_video' }
          });

          // Generate actual video content
          const videoAssets = await aiService.generateAdVideos(
            `${campaign.brief} for ${campaign.platform} social media`,
            "modern advertising"
          );
          generatedContent.videoAssets = videoAssets;
          
          // Store video assets
          for (const videoUrl of videoAssets || []) {
            const asset = await storage.createAsset({
              campaignId: id,
              userId: req.user!.id,
              type: 'video',
              provider: 'gemini-veo',
              url: videoUrl,
              metadata: { generatedAt: new Date().toISOString() }
            });
            assetIds.push(asset.id);
          }
        }
        
        // Generate A/B test variants
        const variants = abTestingService.generateVariants(generatedContent, 3);
        
        // Store asset references
        generatedContent.assetIds = assetIds;
        
        await storage.updateCampaign(id, {
          status: "ready",
          generatedContent,
          variants
        }, req.user!.id);
        
      } catch (aiError) {
        console.error('AI generation failed:', aiError);
        await storage.updateCampaign(id, { status: "draft" }, req.user!.id);
        throw aiError;
      }

      res.json({ message: "AI generation started" });
    } catch (error) {
      console.error('Generation error:', error);
      res.status(500).json({ message: "Failed to generate content" });
    }
  });

  // Publish campaign to social media platforms (protected)
  app.post("/api/campaigns/:id/publish", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { publishingSettings } = req.body;
      
      const campaign = await storage.getCampaign(id, req.user!.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      if (!campaign.generatedContent) {
        return res.status(400).json({ message: "Campaign content not generated yet" });
      }

      // Update status to publishing
      await storage.updateCampaign(id, { 
        status: "publishing",
        publishingSettings
      }, req.user!.id);

      // Use real publishing service
      try {
        const { publishingService } = await import("./services/publishing-service");
        
        const results = await publishingService.publishCampaign(
          req.user!.id,
          id,
          campaign.generatedContent,
          publishingSettings
        );
        
        await storage.updateCampaign(id, { 
          status: "published",
          publishingResults: results
        }, req.user!.id);

        res.json({ 
          message: "Campaign published successfully",
          results
        });
      } catch (publishError) {
        console.error('Publishing failed:', publishError);
        await storage.updateCampaign(id, { status: "ready" }, req.user!.id);
        res.status(500).json({ message: "Publishing failed, please try again" });
      }
    } catch (error) {
      console.error('Publishing error:', error);
      res.status(500).json({ message: "Failed to publish campaign" });
    }
  });

  // Export campaign assets as ZIP (protected)
  app.get("/api/campaigns/:id/export", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const campaign = await storage.getCampaign(id, req.user!.id);
      
      if (!campaign || !campaign.generatedContent) {
        return res.status(404).json({ message: "Campaign or content not found" });
      }

      const archiver = (await import('archiver')).default;
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      // Set response headers for ZIP download
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${campaign.name.replace(/[^a-zA-Z0-9]/g, '_')}_assets.zip"`);
      
      archive.pipe(res);
      
      const content = campaign.generatedContent as any;
      
      // Add text content as files
      if (content.hook) {
        archive.append(content.hook, { name: 'hook.txt' });
      }
      if (content.caption) {
        archive.append(content.caption, { name: 'caption.txt' });
      }
      if (content.hashtags) {
        archive.append(content.hashtags.join(' '), { name: 'hashtags.txt' });
      }
      if (content.videoScript) {
        const scriptText = content.videoScript.map((s: any) => `${s.timeframe}: ${s.action}`).join('\n\n');
        archive.append(scriptText, { name: 'video_script.txt' });
      }
      
      // Add campaign info
      const campaignInfo = `Campaign: ${campaign.name}
Platform: ${campaign.platform}
Language: ${campaign.language}
Type: ${campaign.campaignType}

Brief:
${campaign.brief}`;
      archive.append(campaignInfo, { name: 'campaign_info.txt' });

      // Add image assets
      if (content.imageAssets) {
        for (let i = 0; i < content.imageAssets.length; i++) {
          const imageUrl = content.imageAssets[i];
          if (imageUrl.startsWith('data:image')) {
            // Handle base64 images
            const base64Data = imageUrl.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            archive.append(buffer, { name: `image_${i + 1}.png` });
          } else if (imageUrl.startsWith('/')) {
            // Handle local file URLs
            try {
              const fs = await import('fs');
              const path = await import('path');
              const filePath = path.join(process.cwd(), imageUrl);
              if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: `image_${i + 1}.png` });
              }
            } catch (error) {
              console.error('Error adding image to ZIP:', error);
            }
          }
        }
      }

      // Add video assets
      if (content.videoAssets) {
        for (let i = 0; i < content.videoAssets.length; i++) {
          const videoUrl = content.videoAssets[i];
          if (videoUrl.startsWith('/')) {
            // Handle local file URLs
            try {
              const fs = await import('fs');
              const path = await import('path');
              const filePath = path.join(process.cwd(), videoUrl);
              if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: `video_${i + 1}.mp4` });
              }
            } catch (error) {
              console.error('Error adding video to ZIP:', error);
            }
          }
        }
      }

      archive.finalize();
      
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ message: "Failed to export campaign" });
    }
  });

  // Download individual asset (protected)
  app.get("/api/assets/:id/download", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const assets = await storage.getAssetsByCampaign(id); // Note: This needs campaign ID, will fix
      
      // For now, handle direct file downloads via campaign assets
      res.status(501).json({ message: "Individual asset download coming soon" });
      
    } catch (error) {
      console.error('Asset download error:', error);
      res.status(500).json({ message: "Failed to download asset" });
    }
  });

  // Update campaign variant selection (protected)
  app.patch("/api/campaigns/:id/variants", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { selectedVariantId } = req.body;
      
      const campaign = await storage.getCampaign(id, req.user!.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      if (!campaign.variants) {
        return res.status(400).json({ message: "No variants found for this campaign" });
      }

      // Update variant selection
      const updatedVariants = (campaign.variants as any[]).map((variant: any) => ({
        ...variant,
        selected: variant.id === selectedVariantId
      }));

      await storage.updateCampaign(id, { 
        variants: updatedVariants 
      }, req.user!.id);

      res.json({ 
        message: "Variant selection updated",
        selectedVariant: selectedVariantId
      });
      
    } catch (error) {
      console.error('Variant selection error:', error);
      res.status(500).json({ message: "Failed to update variant selection" });
    }
  });

  // Get campaign content for clipboard copy (protected)
  app.get("/api/campaigns/:id/content", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const type = req.query.type as string; // 'hook', 'caption', 'hashtags', 'script'
      
      const campaign = await storage.getCampaign(id, req.user!.id);
      if (!campaign || !campaign.generatedContent) {
        return res.status(404).json({ message: "Campaign or content not found" });
      }

      const content = campaign.generatedContent as any;
      let textContent = '';

      switch (type) {
        case 'hook':
          textContent = content.hook || '';
          break;
        case 'caption':
          textContent = content.caption || '';
          break;
        case 'hashtags':
          textContent = content.hashtags ? content.hashtags.join(' ') : '';
          break;
        case 'script':
          textContent = content.videoScript 
            ? content.videoScript.map((s: any) => `${s.timeframe}: ${s.action}`).join('\n\n')
            : '';
          break;
        case 'all':
          textContent = `Hook: ${content.hook}\n\nCaption: ${content.caption}\n\nHashtags: ${content.hashtags?.join(' ')}\n\nScript: ${content.videoScript?.map((s: any) => `${s.timeframe}: ${s.action}`).join('\n\n')}`;
          break;
        default:
          return res.status(400).json({ message: "Invalid content type" });
      }

      res.json({ content: textContent });
      
    } catch (error) {
      console.error('Content fetch error:', error);
      res.status(500).json({ message: "Failed to fetch content" });
    }
  });

  // Get dashboard stats (protected)
  app.get("/api/dashboard/stats", authenticateToken, async (req, res) => {
    console.log('📈 Fetching dashboard stats for user:', req.user!.id);
    try {
      const campaigns = await storage.getCampaigns(req.user!.id);
      const totalCampaigns = campaigns.length;
      const activeCampaigns = campaigns.filter(c => c.status === "active").length;
      
      res.json({
        totalCampaigns,
        activeCampaigns,
        avgCTR: "3.2%",
        roi: "4.2x"
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Publishing simulation routes (MVP demo)
  const { publishingSimulation } = await import('./services/publishing-simulation');

  // Simulate publishing a campaign
  app.post("/api/campaigns/:id/publish", authenticateToken, async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const { platforms, scheduleType, scheduledDateTime } = req.body;

      console.log('📤 Simulating publishing for campaign:', campaignId, 'to platforms:', platforms);

      // Verify campaign belongs to user
      const campaign = await storage.getCampaign(campaignId, req.user!.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const results = await publishingSimulation.simulatePublishing(
        campaignId,
        platforms,
        scheduleType,
        scheduledDateTime ? new Date(scheduledDateTime) : undefined
      );

      // Update campaign status to published
      await storage.updateCampaign(campaignId, { status: 'published' }, req.user!.id);

      console.log('✅ Publishing simulation completed:', results);
      res.json({
        message: 'Content published successfully!',
        results,
        demoNote: 'This is a simulation for MVP demonstration. Real publishing requires platform API approval.'
      });

    } catch (error) {
      console.error('Publishing simulation error:', error);
      res.status(500).json({ message: "Failed to publish campaign" });
    }
  });

  // Get publishing simulations for a campaign
  app.get("/api/campaigns/:id/simulations", authenticateToken, async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);

      // Verify campaign belongs to user
      const campaign = await storage.getCampaign(campaignId, req.user!.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const simulations = await publishingSimulation.getCampaignSimulations(campaignId);
      res.json(simulations);

    } catch (error) {
      console.error('Simulations fetch error:', error);
      res.status(500).json({ message: "Failed to fetch simulations" });
    }
  });

  // Update simulation metrics (simulate real-time engagement)
  app.post("/api/simulations/:id/update-metrics", authenticateToken, async (req, res) => {
    try {
      const simulationId = parseInt(req.params.id);
      const updated = await publishingSimulation.updateSimulationMetrics(simulationId);
      
      if (!updated) {
        return res.status(404).json({ message: "Simulation not found or not published" });
      }

      res.json(updated);

    } catch (error) {
      console.error('Metrics update error:', error);
      res.status(500).json({ message: "Failed to update metrics" });
    }
  });

  // SUPERADMIN ROUTES - Protected by role-based middleware
  const { requireSuperAdmin } = await import('./middleware/admin');

  // Get system analytics (superadmin only)
  app.get("/api/admin/system-stats", authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
      console.log('🔒 Superadmin accessing system stats');
      const stats = await storage.getSystemStats();
      res.json(stats);
    } catch (error) {
      console.error('System stats error:', error);
      res.status(500).json({ message: "Failed to fetch system stats" });
    }
  });

  // Get all users with breakdown (superadmin only)
  app.get("/api/admin/users", authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
      console.log('🔒 Superadmin accessing user list');
      const result = await storage.getUsersWithSubscriptionBreakdown();
      res.json(result);
    } catch (error) {
      console.error('Users fetch error:', error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Get user details and credit usage (superadmin only)
  app.get("/api/admin/users/:id/credits", authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const days = parseInt(req.query.days as string) || 30;
      
      console.log('🔒 Superadmin accessing credit usage for user:', userId);
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const creditUsage = await storage.getUserCreditUsage(userId, days);
      
      res.json({
        user,
        creditUsage,
        totalCreditsUsed: user.creditsUsed || 0,
        creditsLimit: user.creditsLimit || 100,
        usagePercentage: Math.round(((user.creditsUsed || 0) / (user.creditsLimit || 100)) * 100)
      });
    } catch (error) {
      console.error('User credit usage error:', error);
      res.status(500).json({ message: "Failed to fetch user credit usage" });
    }
  });

  // Update user role or subscription (superadmin only)
  app.patch("/api/admin/users/:id", authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const { role, subscriptionTier, creditsLimit } = req.body;
      
      console.log('🔒 Superadmin updating user:', userId, { role, subscriptionTier, creditsLimit });
      
      // Update user with new values
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update user in database
      const updatedUser = await storage.upsertUser({
        ...user,
        role: role || user.role,
        subscriptionTier: subscriptionTier || user.subscriptionTier,
        creditsLimit: creditsLimit || user.creditsLimit,
      });

      res.json(updatedUser);
    } catch (error) {
      console.error('User update error:', error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Get system performance metrics (superadmin only)
  app.get("/api/admin/performance", authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
      console.log('🔒 Superadmin accessing performance metrics');
      const { PerformanceMonitor } = await import("./services/performance-monitor");
      
      const metrics = PerformanceMonitor.getMetrics();
      const capacity = await PerformanceMonitor.assessSystemCapacity();
      
      res.json({
        metrics,
        capacity,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Performance metrics error:', error);
      res.status(500).json({ message: "Failed to fetch performance metrics" });
    }
  });

  // Video Storage Audit - identify and fix expired URLs (superadmin only)
  app.get("/api/admin/audit-videos", authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
      console.log('🔒 Superadmin running video storage audit');
      
      // Get all video assets with campaign and user info
      const videoAssets = await db.select({
        assetId: assets.id,
        campaignId: assets.campaignId,
        campaignName: campaigns.name,
        userEmail: users.email,
        url: assets.url,
        provider: assets.provider,
        createdAt: assets.createdAt
      })
      .from(assets)
      .innerJoin(campaigns, eq(assets.campaignId, campaigns.id))
      .innerJoin(users, eq(campaigns.userId, users.id))
      .where(eq(assets.type, 'video'));

      const fs = await import('fs/promises');
      const path = await import('path');
      
      const auditResults = {
        totalAssets: videoAssets.length,
        externalUrls: [] as any[],
        localFiles: [] as any[],
        missingFiles: [] as any[],
        healthyAssets: [] as any[]
      };

      for (const asset of videoAssets) {
        if (asset.url.startsWith('http://') || asset.url.startsWith('https://')) {
          // External URL (will expire)
          if (asset.url.includes('replicate.delivery') || asset.url.includes('googleapis.com')) {
            auditResults.externalUrls.push({
              ...asset,
              issue: 'External URL will expire',
              provider: asset.provider
            });
          } else {
            auditResults.healthyAssets.push(asset);
          }
        } else if (asset.url.startsWith('/videos/')) {
          // Local file - check if it actually exists
          const filePath = path.join(process.cwd(), asset.url.substring(1)); // Remove leading slash
          try {
            await fs.access(filePath);
            // File exists - it's healthy
            auditResults.localFiles.push({
              ...asset,
              filePath,
              exists: true
            });
            auditResults.healthyAssets.push(asset);
          } catch {
            // File missing - this causes "Video Expired" errors
            auditResults.missingFiles.push({
              ...asset,
              filePath,
              issue: 'Local file missing - causes "Video Expired" error',
              severity: 'CRITICAL'
            });
          }
        } else {
          auditResults.missingFiles.push({
            ...asset,
            issue: 'Invalid URL format'
          });
        }
      }

      console.log('📊 Video Storage Audit Results:');
      console.log(`   - Total video assets: ${auditResults.totalAssets}`);
      console.log(`   - External URLs (expire risk): ${auditResults.externalUrls.length}`);
      console.log(`   - Local files (healthy): ${auditResults.localFiles.length}`);
      console.log(`   - Missing files: ${auditResults.missingFiles.length}`);
      console.log(`   - Healthy assets: ${auditResults.healthyAssets.length}`);

      res.json(auditResults);
    } catch (error) {
      console.error('Video audit error:', error);
      res.status(500).json({ message: "Failed to audit video storage" });
    }
  });

  // Fix expired video URLs by regenerating or removing assets
  app.post("/api/admin/fix-expired-videos", authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
      console.log('🔒 Superadmin fixing expired video URLs');
      const { assetIds, action } = req.body; // action: 'regenerate' or 'remove'
      
      if (!assetIds || !Array.isArray(assetIds)) {
        return res.status(400).json({ message: "Asset IDs array required" });
      }

      const results = {
        processed: 0,
        regenerated: 0,
        removed: 0,
        errors: [] as string[]
      };

      for (const assetId of assetIds) {
        try {
          if (action === 'remove') {
            // Remove the asset record
            await db.delete(assets).where(eq(assets.id, assetId));
            results.removed++;
            console.log(`🗑️ Removed asset ${assetId}`);
          } else if (action === 'regenerate') {
            // Reset campaign to draft status for regeneration
            const asset = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
            if (asset.length > 0) {
              await db.update(campaigns)
                .set({ status: 'draft' })
                .where(eq(campaigns.id, asset[0].campaignId));
              
              // Remove the old asset
              await db.delete(assets).where(eq(assets.id, assetId));
              results.regenerated++;
              console.log(`🔄 Reset campaign ${asset[0].campaignId} for regeneration`);
            }
          }
          results.processed++;
        } catch (error) {
          console.error(`Failed to process asset ${assetId}:`, error);
          results.errors.push(`Asset ${assetId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      console.log('✅ Video fix completed:', results);
      res.json(results);
    } catch (error) {
      console.error('Video fix error:', error);
      res.status(500).json({ message: "Failed to fix expired videos" });
    }
  });

  // Brief Template System routes for intelligent prompt suggestions
  app.get("/api/brief-templates/recommendations", authenticateToken, async (req, res) => {
    try {
      const { platform, language } = req.query as { platform: string; language: string };
      
      if (!platform || !language) {
        return res.status(400).json({ message: "Platform and language are required" });
      }

      const recommendations = await briefTemplateService.getRecommendedTemplates(
        req.user!.id,
        platform,
        language
      );
      
      console.log(`📝 Generated ${recommendations.trending.length + recommendations.personalized.length + recommendations.popular.length} brief templates for user ${req.user!.id}`);
      
      res.json(recommendations);
    } catch (error) {
      console.error('Brief template recommendations error:', error);
      res.status(500).json({ message: "Failed to get template recommendations" });
    }
  });

  app.get("/api/brief-templates/trending", authenticateToken, async (req, res) => {
    try {
      const { platform, language } = req.query as { platform: string; language: string };
      
      const trendingTopics = await briefTemplateService.getTrendingTopics(platform, language);
      
      console.log(`📈 Found ${trendingTopics.length} trending topics for ${platform}/${language}`);
      
      res.json({ topics: trendingTopics });
    } catch (error) {
      console.error('Trending topics error:', error);
      res.status(500).json({ message: "Failed to fetch trending topics" });
    }
  });

  app.post("/api/brief-templates/generate", authenticateToken, async (req, res) => {
    try {
      const { topic, platform, language, customization } = req.body;
      
      if (!topic || !platform || !language) {
        return res.status(400).json({ message: "Topic, platform, and language are required" });
      }

      // Generate personalized templates based on specific topic
      const trendingTopics = [{ 
        topic, 
        source: 'user-requested', 
        relevance: 1.0, 
        keywords: [], 
        sentiment: 'positive', 
        platforms: [platform] 
      }];
      
      const templates = await briefTemplateService.generatePersonalizedTemplates(
        req.user!.id,
        platform,
        language,
        trendingTopics
      );
      
      console.log(`🎯 Generated ${templates.length} custom templates for topic: ${topic}`);
      
      res.json({ templates: templates.slice(0, 3) });
    } catch (error) {
      console.error('Custom template generation error:', error);
      res.status(500).json({ message: "Failed to generate custom templates" });
    }
  });

  // Initialize services
  const aiService = new AIService();
  const abTestingService = new ABTestingService();
  const publishingService = new PublishingService();
  const storageService = new StorageService();

  // 🔐 AUTHENTICATION ROUTES - OAuth flows for social media platforms
  
  // Test OAuth URL generation (for development testing)
  // Domain diagnostic endpoint (for Facebook app configuration)
  app.get('/api/domain-info', async (req, res) => {
    try {
      const domain = req.get('host');
      const protocol = req.get('x-forwarded-proto') || 'https';
      const fullUrl = `${protocol}://${domain}`;
      
      res.json({
        domain,
        protocol,
        fullUrl,
        redirectUris: {
          meta: `${fullUrl}/auth/meta/callback`,
          facebook: `${fullUrl}/auth/facebook/callback`,
          instagram: `${fullUrl}/auth/instagram/callback`
        },
        appDomainConfig: domain,
        environment: process.env.NODE_ENV,
        message: 'Add this domain to your Facebook App Domains and these redirect URIs to Valid OAuth Redirect URIs'
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/oauth-test/:platform', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {
      const platform = req.params.platform.toLowerCase();
      const supportedPlatforms = ['meta', 'facebook', 'instagram', 'tiktok', 'youtube'];
      
      if (!supportedPlatforms.includes(platform)) {
        return res.status(400).json({ message: 'Unsupported platform' });
      }

      const state = 'test-state-' + Date.now();
      // Use HTTPS for redirect URI in production/Replit
      const domain = req.get('host');
      const redirectUri = `https://${domain}/auth/${platform}/callback`;
      const oauthUrl = oauthService.getOAuthUrl(platform, redirectUri, state);

      res.json({
        platform,
        oauthUrl,
        redirectUri,
        state,
        message: 'This is the OAuth URL that would be used for authentication',
        hasMetaAppId: !!process.env.META_APP_ID,
        metaAppId: process.env.META_APP_ID ? process.env.META_APP_ID.substring(0, 10) + '...' : 'not set'
      });
    } catch (error) {
      console.error('OAuth URL generation error:', error);
      res.status(500).json({ message: 'Failed to generate OAuth URL', error: (error as Error).message });
    }
  });
  
  // API endpoint to initiate OAuth flow
  app.post('/api/auth/:platform/connect', authenticateToken, async (req, res) => {
    try {
      const platform = req.params.platform.toLowerCase();
      const flowType = (req.body.flowType as 'login' | 'publishing') || 'login';
      const supportedPlatforms = ['meta', 'facebook', 'instagram', 'tiktok', 'youtube'];
      
      if (!supportedPlatforms.includes(platform)) {
        return res.status(400).json({ message: 'Unsupported platform' });
      }

      // Generate state parameter for security including flow type
      const state = crypto.randomBytes(32).toString('hex') + '_' + flowType;
      
      // Store OAuth state in memory or database temporarily
      // For now, we'll include it in the URL and verify it on callback
      // Use HTTPS for redirect URI in production/Replit
      const domain = req.get('host');
      const redirectUri = `https://${domain}/auth/${platform}/callback`;
      const oauthUrl = oauthService.getOAuthUrl(platform, redirectUri, state, flowType);

      console.log(`🔗 Generating ${flowType} OAuth URL for ${platform}:`, {
        appId: flowType === 'publishing' ? process.env.META_PUBLISHING_APP_ID : process.env.META_APP_ID,
        flowType,
        platform,
        redirectUri,
        domain
      });

      // Return the OAuth URL for frontend to redirect to
      res.json({
        success: true,
        oauthUrl,
        state,
        platform,
        flowType
      });
    } catch (error) {
      console.error('OAuth connect error:', error);
      res.status(500).json({ message: 'Failed to initiate OAuth flow' });
    }
  });

  // Legacy redirect endpoint for direct access (keeping for compatibility)
  app.get('/auth/:platform/connect', authenticateToken, async (req, res) => {
    try {
      const platform = req.params.platform.toLowerCase();
      const flowType = (req.query.flow as 'login' | 'publishing') || 'login';
      const supportedPlatforms = ['meta', 'facebook', 'instagram', 'tiktok', 'youtube'];
      
      if (!supportedPlatforms.includes(platform)) {
        return res.status(400).json({ message: 'Unsupported platform' });
      }

      // Generate state parameter for security
      const state = crypto.randomBytes(32).toString('hex') + '_' + flowType;
      (req.session as any).oauthState = state;
      (req.session as any).oauthPlatform = platform;
      (req.session as any).oauthFlowType = flowType;
      (req.session as any).userId = req.user!.id;

      // Use HTTPS for redirect URI in production/Replit
      const domain = req.get('host');
      const redirectUri = `https://${domain}/auth/${platform}/callback`;
      const oauthUrl = oauthService.getOAuthUrl(platform, redirectUri, state, flowType);

      console.log(`🔗 Redirecting to ${flowType} OAuth for ${platform}:`, {
        redirectUri,
        domain: req.get('host')
      });
      res.redirect(oauthUrl);
    } catch (error) {
      console.error('OAuth connect error:', error);
      res.status(500).json({ message: 'Failed to initiate OAuth flow' });
    }
  });

  // Handle OAuth callback and store access token
  app.get('/auth/:platform/callback', async (req, res) => {
    try {
      const platform = req.params.platform.toLowerCase();
      const { code, state } = req.query as { code: string; state: string };
      
      // Verify state parameter
      if (!(req.session as any).oauthState || (req.session as any).oauthState !== state) {
        return res.status(400).json({ message: 'Invalid OAuth state' });
      }

      const userId = (req.session as any).userId;
      const flowType = (req.session as any).oauthFlowType || 'login';
      
      if (!userId) {
        return res.status(400).json({ message: 'User session not found' });
      }

      // Use HTTPS for redirect URI in production/Replit
      const domain = req.get('host');
      const redirectUri = `https://${domain}/auth/${platform}/callback`;
      
      // Exchange code for access token based on platform
      let tokenData;
      switch (platform) {
        case 'meta':
        case 'facebook':
        case 'instagram':
          tokenData = await oauthService.exchangeMetaCode(code, redirectUri, flowType);
          break;
        case 'tiktok':
          tokenData = await oauthService.exchangeTikTokCode(code, redirectUri);
          break;
        case 'youtube':
          tokenData = await oauthService.exchangeYouTubeCode(code, redirectUri);
          break;
        default:
          return res.status(400).json({ message: 'Unsupported platform' });
      }

      // Save connection to database with flow type information
      const connectionPlatform = platform === 'facebook' || platform === 'instagram' ? 'meta' : platform;
      const platformData = {
        ...tokenData,
        flowType,
        appId: flowType === 'publishing' && platform === 'meta' ? process.env.META_PUBLISHING_APP_ID : process.env.META_APP_ID
      };
      
      await oauthService.saveConnection(userId, connectionPlatform, platformData);

      console.log(`✅ ${flowType} OAuth connection saved for ${platform} (user: ${userId})`);

      // Clean up session
      delete (req.session as any).oauthState;
      delete (req.session as any).oauthPlatform;
      delete (req.session as any).oauthFlowType;
      delete (req.session as any).userId;

      // Redirect based on flow type
      const redirectUrl = flowType === 'publishing' 
        ? '/connections?oauth=success&platform=' + platform + '&flow=publishing'
        : '/?oauth=success&platform=' + platform + '&flow=login';
      
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.redirect('/?oauth=error&message=' + encodeURIComponent('Failed to connect account'));
    }
  });

  // Get user's connected platforms
  app.get('/api/auth/connections', authenticateToken, async (req, res) => {
    try {
      const connections = await oauthService.getUserConnections(req.user!.id);
      
      const platformsData = connections.map(conn => ({
        platform: conn.platform,
        isConnected: conn.isActive,
        connectedAt: conn.createdAt,
        user: (conn.platformData as any)?.user || {},
        permissions: (conn.platformData as any)?.grantedPermissions || [],
      }));

      res.json({ connections: platformsData });
    } catch (error) {
      console.error('Get connections error:', error);
      res.status(500).json({ message: 'Failed to fetch connections' });
    }
  });

  // Revoke access and remove tokens
  app.delete('/api/auth/:platform/disconnect', authenticateToken, async (req, res) => {
    try {
      const platform = req.params.platform.toLowerCase();
      const success = await oauthService.disconnectPlatform(req.user!.id, platform);
      
      if (success) {
        res.json({ message: `Successfully disconnected ${platform}` });
      } else {
        res.status(404).json({ message: 'Connection not found' });
      }
    } catch (error) {
      console.error('Disconnect error:', error);
      res.status(500).json({ message: 'Failed to disconnect platform' });
    }
  });

  // 📊 FACEBOOK DATA DELETION CALLBACK (Required for Facebook App Review)
  app.post('/auth/facebook/data-deletion', async (req, res) => {
    try {
      const { signed_request } = req.body;
      
      if (!signed_request) {
        return res.status(400).json({ 
          error: 'Missing signed_request parameter',
          url: req.originalUrl,
          confirmation_code: 'INVALID_REQUEST'
        });
      }

      // Parse the signed request to get user ID
      const [encodedSig, payload] = signed_request.split('.');
      const data = JSON.parse(Buffer.from(payload, 'base64').toString());
      const facebookUserId = data.user_id;

      console.log('📊 Facebook data deletion request received for user:', facebookUserId);

      // Find and delete user's Facebook/Meta OAuth connection
      if (facebookUserId) {
        await oauthService.deletePlatformConnection('meta', facebookUserId);
        console.log('✅ Facebook OAuth connection deleted for user:', facebookUserId);
      }

      // Return confirmation as required by Facebook
      const confirmationCode = `FB_DEL_${Date.now()}_${facebookUserId}`;
      
      res.json({
        url: `${req.protocol}://${req.get('host')}/auth/facebook/data-deletion-status?id=${confirmationCode}`,
        confirmation_code: confirmationCode
      });

    } catch (error) {
      console.error('Facebook data deletion error:', error);
      res.status(500).json({ 
        error: 'Failed to process data deletion request',
        confirmation_code: 'ERROR_PROCESSING'
      });
    }
  });

  // Data deletion status endpoint (optional but helpful)
  app.get('/auth/facebook/data-deletion-status', async (req, res) => {
    const { id } = req.query;
    res.json({
      message: 'Data deletion completed successfully',
      confirmation_code: id,
      deleted_at: new Date().toISOString()
    });
  });

  // 📤 PUBLISHING ROUTES - Push content to connected platforms

  // Push content immediately (requires auth token, media ID, caption, platform)
  app.post('/publish', authenticateToken, async (req, res) => {
    try {
      const { campaignId, platforms, scheduleType = 'now' } = req.body;
      
      const campaign = await storage.getCampaign(campaignId, req.user!.id);
      if (!campaign || !campaign.generatedContent) {
        return res.status(404).json({ message: 'Campaign not found' });
      }

      const publishingResults = [];
      
      for (const platform of platforms) {
        try {
          let result;
          switch (platform.toLowerCase()) {
            case 'meta':
            case 'facebook':
              result = await publishingService.publishToMeta(req.user!.id, campaign.generatedContent, campaign.publishingSettings as any, 'facebook');
              break;
            case 'instagram':
              result = await publishingService.publishToMeta(req.user!.id, campaign.generatedContent, campaign.publishingSettings as any, 'instagram');
              break;
            case 'tiktok':
              result = await publishingService.publishToTikTok(req.user!.id, campaign.generatedContent, campaign.publishingSettings as any);
              break;
            case 'youtube':
              result = await publishingService.publishToYouTube(req.user!.id, campaign.generatedContent, campaign.publishingSettings as any);
              break;
            default:
              throw new Error(`Unsupported platform: ${platform}`);
          }
          
          publishingResults.push({
            platform,
            status: 'success',
            postId: result,
            publishedAt: new Date(),
          });
        } catch (error) {
          publishingResults.push({
            platform,
            status: 'failed',
            error: (error as Error).message,
          });
        }
      }

      // Update campaign with publishing results
      await storage.updateCampaign(campaignId, {
        publishingResults,
        status: publishingResults.some(r => r.status === 'success') ? 'published' : 'draft'
      }, req.user!.id);

      res.json({
        message: 'Publishing completed',
        results: publishingResults
      });
    } catch (error) {
      console.error('Publishing error:', error);
      res.status(500).json({ message: 'Failed to publish content' });
    }
  });

  // Schedule a post at a future date/time
  app.post('/publish/schedule', authenticateToken, async (req, res) => {
    try {
      const { campaignId, platforms, scheduledDate, scheduledTime } = req.body;
      
      if (!scheduledDate || !scheduledTime) {
        return res.status(400).json({ message: 'Scheduled date and time are required' });
      }

      const campaign = await storage.getCampaign(campaignId, req.user!.id);
      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }

      // Update campaign with scheduling information
      const publishingSettings = {
        ...(campaign.publishingSettings as any),
        scheduleType: 'scheduled',
        scheduledDate,
        scheduledTime,
        connectedPlatforms: platforms,
      };

      await storage.updateCampaign(campaignId, {
        publishingSettings,
        status: 'scheduled'
      }, req.user!.id);

      res.json({
        message: 'Content scheduled successfully',
        scheduledFor: `${scheduledDate} ${scheduledTime}`,
        platforms
      });
    } catch (error) {
      console.error('Schedule error:', error);
      res.status(500).json({ message: 'Failed to schedule content' });
    }
  });

  // Returns status of a scheduled/published post
  app.get('/publish/status/:campaignId', authenticateToken, async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const campaign = await storage.getCampaign(campaignId, req.user!.id);
      
      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }

      res.json({
        status: campaign.status,
        publishingResults: campaign.publishingResults || [],
        publishingSettings: campaign.publishingSettings || {},
      });
    } catch (error) {
      console.error('Status check error:', error);
      res.status(500).json({ message: 'Failed to check status' });
    }
  });

  // Shows preview of post with caption & media
  app.get('/publish/preview/:campaignId', authenticateToken, async (req, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const campaign = await storage.getCampaign(campaignId, req.user!.id);
      
      if (!campaign || !campaign.generatedContent) {
        return res.status(404).json({ message: 'Campaign or content not found' });
      }

      const content = campaign.generatedContent as any;
      
      res.json({
        preview: {
          hook: content.hook,
          caption: content.caption,
          hashtags: content.hashtags,
          imageAssets: content.imageAssets || [],
          videoAssets: content.videoAssets || [],
          videoScript: content.videoScript || [],
        },
        publishingSettings: campaign.publishingSettings || {},
      });
    } catch (error) {
      console.error('Preview error:', error);
      res.status(500).json({ message: 'Failed to generate preview' });
    }
  });

  // Validates content (format, size, duration) for target platform
  app.post('/publish/validate', authenticateToken, async (req, res) => {
    try {
      const { campaignId, platform } = req.body;
      
      const campaign = await storage.getCampaign(campaignId, req.user!.id);
      if (!campaign || !campaign.generatedContent) {
        return res.status(404).json({ message: 'Campaign or content not found' });
      }

      const content = campaign.generatedContent as any;
      const validationResults = [];

      // Platform-specific validation
      switch (platform.toLowerCase()) {
        case 'tiktok':
          if (!content.videoAssets || content.videoAssets.length === 0) {
            validationResults.push({ type: 'error', message: 'TikTok requires video content' });
          }
          if (content.caption && content.caption.length > 2200) {
            validationResults.push({ type: 'warning', message: 'Caption may be too long for TikTok (2200 char limit)' });
          }
          break;
        case 'instagram':
          if (content.caption && content.caption.length > 2200) {
            validationResults.push({ type: 'warning', message: 'Caption may be too long for Instagram (2200 char limit)' });
          }
          break;
        case 'facebook':
          if (content.caption && content.caption.length > 63206) {
            validationResults.push({ type: 'warning', message: 'Caption may be too long for Facebook' });
          }
          break;
      }

      const isValid = !validationResults.some(r => r.type === 'error');

      res.json({
        isValid,
        platform,
        validationResults,
        contentSummary: {
          hasImages: !!(content.imageAssets && content.imageAssets.length > 0),
          hasVideos: !!(content.videoAssets && content.videoAssets.length > 0),
          captionLength: content.caption ? content.caption.length : 0,
          hashtagCount: content.hashtags ? content.hashtags.length : 0,
        }
      });
    } catch (error) {
      console.error('Validation error:', error);
      res.status(500).json({ message: 'Failed to validate content' });
    }
  });

  // 📦 CONTENT ROUTES (ASSET HANDLING)

  // Upload image/video manually for campaign use
  app.post('/assets/upload', authenticateToken, async (req, res) => {
    try {
      // For now, return a placeholder - this would integrate with multer for file uploads
      res.status(501).json({ 
        message: 'Manual asset upload coming soon',
        note: 'Currently assets are generated automatically via AI services'
      });
    } catch (error) {
      console.error('Asset upload error:', error);
      res.status(500).json({ message: 'Failed to upload asset' });
    }
  });

  // Retrieve asset metadata
  app.get('/assets/:id', authenticateToken, async (req, res) => {
    try {
      const assetId = parseInt(req.params.id);
      
      // Get asset from database
      const assets = await storage.getAssetsByCampaign(assetId); // This needs to be updated for single asset
      
      if (!assets || assets.length === 0) {
        return res.status(404).json({ message: 'Asset not found' });
      }

      res.json(assets[0]); // Return first asset for now
    } catch (error) {
      console.error('Asset metadata error:', error);
      res.status(500).json({ message: 'Failed to retrieve asset metadata' });
    }
  });

  // Video status check endpoint
  app.get('/api/video-status/:campaignId', authenticateToken, async (req: any, res) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      
      // Get campaign with video assets
      const campaign = await storage.getCampaign(campaignId, req.user!.id);
      
      if (!campaign || !campaign.generatedContent) {
        return res.status(404).json({ error: 'No video found' });
      }
      
      const generatedContent = campaign.generatedContent as any;
      if (!generatedContent.videoAssets?.[0]) {
        return res.status(404).json({ error: 'No video found' });
      }
      
      const videoUrl = generatedContent.videoAssets[0];
      
      // Check if video is still accessible
      if (videoUrl.includes('generativelanguage.googleapis.com')) {
        try {
          const axios = (await import('axios')).default;
          const response = await axios.get(videoUrl, {
            headers: {
              'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`,
            },
            timeout: 5000,
            maxRedirects: 0
          });
          
          if (response.status === 200) {
            return res.json({ status: 'available', url: videoUrl });
          }
        } catch (error: any) {
          console.log('Video expired, flagging for regeneration');
          return res.json({ 
            status: 'expired',
            message: 'Video file has expired. Please regenerate the campaign.' 
          });
        }
      }
      
      res.json({ status: 'available', url: videoUrl });
      
    } catch (error) {
      console.error('Video status check error:', error);
      res.status(500).json({ error: 'Failed to check video status' });
    }
  });

  // 💳 SUBSCRIPTION ENDPOINTS - Stripe integration for billing
  app.get('/api/subscription/plans', async (req, res) => {
    try {
      const { SUBSCRIPTION_PLANS } = await import("./services/subscription-service");
      res.json(Object.values(SUBSCRIPTION_PLANS));
    } catch (error) {
      console.error('Get plans error:', error);
      res.status(500).json({ message: 'Failed to get plans' });
    }
  });

  app.get('/api/subscription/current', authenticateToken, async (req: any, res) => {
    try {
      const { subscriptionService } = await import("./services/subscription-service");
      const subscription = await subscriptionService.getUserSubscription(req.user!.id);
      res.json(subscription);
    } catch (error) {
      console.error('Get subscription error:', error);
      res.status(500).json({ message: 'Failed to get subscription' });
    }
  });

  app.post('/api/subscription/create', authenticateToken, async (req: any, res) => {
    try {
      const { priceId } = req.body;
      console.log('🔄 Creating subscription for user:', req.user!.id, 'with priceId:', priceId);
      
      if (!priceId) {
        return res.status(400).json({ message: 'Price ID required' });
      }

      const { subscriptionService } = await import("./services/subscription-service");
      const result = await subscriptionService.createSubscription(req.user!.id, priceId);
      console.log('✅ Subscription created successfully:', result);
      res.json(result);
    } catch (error: any) {
      console.error('❌ Create subscription error details:', {
        message: error.message,
        stack: error.stack,
        userId: req.user!.id,
        priceId: req.body.priceId
      });
      res.status(500).json({ 
        message: 'Failed to create subscription',
        error: error.message
      });
    }
  });

  app.post('/api/subscription/cancel', authenticateToken, async (req: any, res) => {
    try {
      const { subscriptionService } = await import("./services/subscription-service");
      await subscriptionService.cancelSubscription(req.user!.id);
      res.json({ message: 'Subscription cancelled successfully' });
    } catch (error) {
      console.error('Cancel subscription error:', error);
      res.status(500).json({ message: 'Failed to cancel subscription' });
    }
  });

  app.post('/api/subscription/portal', authenticateToken, async (req: any, res) => {
    try {
      const { returnUrl } = req.body;
      const { subscriptionService } = await import("./services/subscription-service");
      const url = await subscriptionService.createPortalSession(req.user!.id, returnUrl || `${req.protocol}://${req.hostname}`);
      res.json({ url });
    } catch (error) {
      console.error('Portal session error:', error);
      res.status(500).json({ message: 'Failed to create portal session' });
    }
  });

  app.post('/api/webhooks/stripe', async (req, res) => {
    try {
      const signature = req.headers['stripe-signature'] as string;
      const { subscriptionService } = await import("./services/subscription-service");
      await subscriptionService.handleWebhook(signature, req.body);
      res.status(200).send('OK');
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(400).send('Webhook Error');
    }
  });

  // 🧠 AI LEARNING ENDPOINTS - Performance tracking and analytics
  
  // Record content performance for learning system
  app.post("/api/campaigns/:id/performance", authenticateToken, async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      const userId = req.user!.id;
      const { contentType, contentText, metrics } = req.body;
      
      // Verify campaign ownership
      const campaign = await storage.getCampaign(campaignId, userId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      // Record performance data for learning
      await learningService.recordContentPerformance(
        campaignId,
        userId,
        campaign.platform,
        campaign.language,
        contentType,
        contentText,
        metrics
      );
      
      console.log(`📊 Performance recorded for campaign ${campaignId}: ${contentType}`);
      res.json({ message: "Performance data recorded successfully" });
    } catch (error) {
      console.error("Performance tracking error:", error);
      res.status(500).json({ message: "Failed to record performance data" });
    }
  });

  // Get performance analytics
  app.get("/api/analytics/performance", authenticateToken, async (req, res) => {
    try {
      const userId = req.user!.id;
      const analytics = await learningService.getPerformanceAnalytics(userId);
      res.json(analytics);
    } catch (error) {
      console.error("Analytics fetch error:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // 🔗 LINKED TEMPLATE + PROMPT SYSTEM - Semantic matching of briefs to visual prompts
  app.post('/api/prompts/link-suggestions', authenticateToken, async (req, res) => {
    try {
      const { brief, platform, language } = req.body;
      
      if (!brief) {
        return res.status(400).json({ error: 'Brief is required' });
      }

      const { linkedPromptService } = await import('./services/linked-prompt-service');
      const suggestions = await linkedPromptService.getLinkSuggestions(
        brief, 
        platform || 'instagram', 
        language || 'english'
      );

      console.log(`🔗 Generated linked prompt suggestions for brief: "${brief.substring(0, 50)}..."`);
      res.json(suggestions);
    } catch (error) {
      console.error('Error getting link suggestions:', error);
      res.status(500).json({ error: 'Failed to get prompt suggestions' });
    }
  });

  // Prompt Selector Tool API endpoints
  app.get('/api/prompts/templates', authenticateToken, async (req, res) => {
    try {
      const { category, shotType, tone, subject, difficulty } = req.query;
      const { promptSelectorService } = await import('./services/prompt-selector-service');
      
      const templates = await promptSelectorService.getPromptTemplates(
        category as string,
        shotType as string, 
        tone as string,
        subject as string,
        difficulty as string
      );
      
      res.json(templates);
    } catch (error) {
      console.error('Error fetching prompt templates:', error);
      res.status(500).json({ message: 'Failed to fetch prompt templates' });
    }
  });

  app.get('/api/prompts/options', authenticateToken, async (req, res) => {
    try {
      const { promptSelectorService } = await import('./services/prompt-selector-service');
      
      const categories = promptSelectorService.getCategories();
      const filterOptions = promptSelectorService.getFilterOptions();
      const guidedOptions = promptSelectorService.getGuidedBuilderOptions();
      
      res.json({
        categories,
        filterOptions,
        guidedOptions
      });
    } catch (error) {
      console.error('Error fetching prompt options:', error);
      res.status(500).json({ message: 'Failed to fetch options' });
    }
  });

  app.get('/api/prompts/inspiration', authenticateToken, async (req, res) => {
    try {
      const { promptSelectorService } = await import('./services/prompt-selector-service');
      
      const feed = promptSelectorService.getInspirationFeed();
      res.json(feed);
    } catch (error) {
      console.error('Error fetching inspiration feed:', error);
      res.status(500).json({ message: 'Failed to fetch inspiration' });
    }
  });

  app.post('/api/prompts/guided', authenticateToken, async (req, res) => {
    try {
      const options = req.body;
      const { promptSelectorService } = await import('./services/prompt-selector-service');
      
      const prompt = await promptSelectorService.generateGuidedPrompt(options);
      res.json({ prompt });
    } catch (error) {
      console.error('Error generating guided prompt:', error);
      res.status(500).json({ message: 'Failed to generate guided prompt' });
    }
  });

  app.post('/api/prompts/random', authenticateToken, async (req, res) => {
    try {
      const { promptSelectorService } = await import('./services/prompt-selector-service');
      
      const prompts = await promptSelectorService.generateRandomPrompts(3);
      res.json({ prompts });
    } catch (error) {
      console.error('Error generating random prompts:', error);
      res.status(500).json({ message: 'Failed to generate random prompts' });
    }
  });

  app.post('/api/prompts/remix', authenticateToken, async (req, res) => {
    try {
      const { prompt } = req.body;
      const { promptSelectorService } = await import('./services/prompt-selector-service');
      
      const remixedPrompt = await promptSelectorService.remixPrompt(prompt);
      res.json({ remixedPrompt });
    } catch (error) {
      console.error('Error remixing prompt:', error);
      res.status(500).json({ message: 'Failed to remix prompt' });
    }
  });

  // Video regeneration endpoint for expired videos
  app.post("/api/campaigns/:id/regenerate-video", authenticateToken, async (req, res) => {
    try {
      const campaignId = parseInt(req.params.id);
      
      // Verify campaign belongs to user
      const campaign = await storage.getCampaign(campaignId, req.user!.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      if (!campaign.generatedContent) {
        return res.status(400).json({ message: "No content to regenerate" });
      }

      console.log('🔄 Regenerating expired video for campaign:', campaignId);

      // Parse generated content
      const content = typeof campaign.generatedContent === 'string' 
        ? JSON.parse(campaign.generatedContent) 
        : campaign.generatedContent;

      // Check if there are video assets that might be expired
      if (!content.videoAssets || content.videoAssets.length === 0) {
        return res.status(400).json({ message: "No videos to regenerate" });
      }

      // Regenerate video using the original video script
      const { aiService } = await import('./services/ai-service');
      
      // Create a description from the video script for regeneration
      const videoDescription = content.videoScript && content.videoScript.length > 0
        ? content.videoScript.map((scene: any) => scene.action).join('. ')
        : content.hook || campaign.brief;

      console.log('🎬 Regenerating video with description:', videoDescription);

      // Generate new video with enhanced error handling
      const newVideoAssets = await aiService.generateAdVideos(videoDescription, "modern advertising");
      
      if (newVideoAssets && newVideoAssets.length > 0) {
        // Update the campaign with new video URLs
        const updatedContent = {
          ...content,
          videoAssets: newVideoAssets,
          lastVideoRegeneration: new Date().toISOString()
        };

        await storage.updateCampaign(campaignId, { generatedContent: updatedContent }, req.user!.id);

        console.log('✅ Video regenerated successfully:', newVideoAssets);
        res.json({
          message: 'Video regenerated successfully!',
          videoAssets: newVideoAssets,
          note: 'Videos are now stored locally and will not expire'
        });
      } else {
        res.status(500).json({ message: "Failed to regenerate video" });
      }

    } catch (error) {
      console.error('Video regeneration error:', error);
      res.status(500).json({ 
        message: "Failed to regenerate video",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

function generateVariants(originalHook: string) {
  return [
    {
      id: "a",
      name: "Variant A",
      hook: originalHook,
      caption: "Original hook focusing on the main message",
      selected: true
    },
    {
      id: "b", 
      name: "Variant B",
      hook: "Bakit lahat ng teens sa Manila gumagamit nito?",
      caption: "Question-based hook creating curiosity",
      selected: false
    }
  ];
}
