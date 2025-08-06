import { db } from '../db';
import { publishingSimulations, campaigns, type InsertPublishingSimulation } from '@shared/schema';
import { eq } from 'drizzle-orm';

export class PublishingSimulationService {
  
  // Simulate publishing to social media platforms
  async simulatePublishing(campaignId: number, platforms: string[], scheduleType: 'now' | 'scheduled', scheduledDateTime?: Date) {
    const campaign = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    
    if (!campaign[0]) {
      throw new Error('Campaign not found');
    }

    const results = [];
    
    for (const platform of platforms) {
      const simulationData = this.generateMockAPIResponse(platform, campaign[0]);
      const metrics = this.generateInitialMetrics(platform);
      
      const scheduleTime = scheduleType === 'now' ? new Date() : (scheduledDateTime || new Date());
      
      const simulation: InsertPublishingSimulation = {
        campaignId,
        platform: platform.toLowerCase(),
        status: scheduleType === 'now' ? 'published' : 'scheduled',
        scheduledFor: scheduleTime,
        publishedAt: scheduleType === 'now' ? new Date() : null,
        simulationData,
        metrics: scheduleType === 'now' ? metrics : null,
      };

      const [created] = await db.insert(publishingSimulations)
        .values(simulation)
        .returning();

      results.push({
        platform,
        status: created.status,
        postId: simulationData.id,
        scheduledFor: created.scheduledFor,
        publishedAt: created.publishedAt,
        previewUrl: this.generatePreviewUrl(platform, simulationData.id),
      });
    }

    return results;
  }

  // Generate realistic mock API responses for each platform
  private generateMockAPIResponse(platform: string, campaign: any) {
    const baseId = Math.random().toString(36).substring(2, 15);
    
    switch (platform.toLowerCase()) {
      case 'facebook':
        return {
          id: `${baseId}_facebook`,
          message: "Post created successfully",
          post_id: `10158${Math.floor(Math.random() * 1000000)}`,
          platform: 'facebook',
          type: 'status',
          privacy: { value: 'EVERYONE' },
          created_time: new Date().toISOString(),
          story: `${campaign.brandName || 'Brand'} published a new post.`,
        };
        
      case 'instagram':
        return {
          id: `${baseId}_instagram`,
          media_type: campaign.contentType === 'video' ? 'VIDEO' : 'IMAGE',
          media_product_type: 'FEED',
          permalink: `https://www.instagram.com/p/${baseId}/`,
          timestamp: new Date().toISOString(),
          username: 'your_brand_handle',
          caption: (campaign.generatedContent as any)?.caption || '',
        };
        
      case 'tiktok':
        return {
          data: {
            video_id: `v${Math.floor(Math.random() * 10000000000)}`,
            share_url: `https://www.tiktok.com/@brandname/video/${Math.floor(Math.random() * 10000000000)}`,
            embed_link: `https://www.tiktok.com/embed/v2/${baseId}`,
            create_time: Math.floor(Date.now() / 1000),
            title: ((campaign.generatedContent as any)?.caption?.substring(0, 150)) || '',
          },
          message: 'success',
        };
        
      case 'youtube':
        return {
          kind: 'youtube#video',
          etag: `"${baseId}"`,
          id: `vid_${baseId}`,
          snippet: {
            publishedAt: new Date().toISOString(),
            channelId: `UC${baseId.toUpperCase()}`,
            title: campaign.productName || campaign.brandName || 'New Video',
            description: (campaign.generatedContent as any)?.caption || '',
            channelTitle: 'Your Brand Channel',
            categoryId: '22', // People & Blogs
            liveBroadcastContent: 'none',
            defaultLanguage: 'en',
          },
          status: {
            uploadStatus: 'processed',
            privacyStatus: 'public',
            license: 'youtube',
            embeddable: true,
            publicStatsViewable: true,
          },
        };
        
      default:
        return {
          id: baseId,
          status: 'published',
          message: 'Content published successfully',
          timestamp: new Date().toISOString(),
        };
    }
  }

  // Generate initial engagement metrics for demo
  private generateInitialMetrics(platform: string) {
    const baseEngagement = {
      views: Math.floor(Math.random() * 1000) + 100,
      likes: Math.floor(Math.random() * 50) + 10,
      comments: Math.floor(Math.random() * 10) + 2,
      shares: Math.floor(Math.random() * 20) + 5,
    };

    switch (platform.toLowerCase()) {
      case 'facebook':
        return {
          ...baseEngagement,
          reactions: {
            like: baseEngagement.likes,
            love: Math.floor(Math.random() * 15),
            wow: Math.floor(Math.random() * 5),
            haha: Math.floor(Math.random() * 8),
            sad: Math.floor(Math.random() * 2),
            angry: Math.floor(Math.random() * 1),
          },
          reach: baseEngagement.views * 1.2,
          impressions: baseEngagement.views * 1.5,
        };
        
      case 'instagram':
        return {
          ...baseEngagement,
          saves: Math.floor(Math.random() * 15) + 3,
          reach: baseEngagement.views * 0.8,
          impressions: baseEngagement.views * 1.3,
          profile_visits: Math.floor(Math.random() * 20) + 5,
        };
        
      case 'tiktok':
        return {
          views: Math.floor(Math.random() * 5000) + 500, // TikTok typically gets higher views
          likes: Math.floor(Math.random() * 200) + 50,
          comments: Math.floor(Math.random() * 30) + 5,
          shares: Math.floor(Math.random() * 100) + 20,
          play_time: Math.floor(Math.random() * 10000) + 2000, // seconds
          completion_rate: (Math.random() * 0.4 + 0.3).toFixed(2), // 30-70%
        };
        
      case 'youtube':
        return {
          views: Math.floor(Math.random() * 2000) + 200,
          likes: Math.floor(Math.random() * 100) + 20,
          dislikes: Math.floor(Math.random() * 5) + 1,
          comments: Math.floor(Math.random() * 15) + 3,
          subscribersGained: Math.floor(Math.random() * 10) + 1,
          averageViewDuration: Math.floor(Math.random() * 120) + 30, // seconds
          impressions: Math.floor(Math.random() * 3000) + 300,
        };
        
      default:
        return baseEngagement;
    }
  }

  // Generate preview URLs for social media posts
  private generatePreviewUrl(platform: string, postId: string): string {
    switch (platform.toLowerCase()) {
      case 'facebook':
        return `https://www.facebook.com/posts/${postId}`;
      case 'instagram':
        return `https://www.instagram.com/p/${postId}/`;
      case 'tiktok':
        return `https://www.tiktok.com/@brand/video/${postId}`;
      case 'youtube':
        return `https://www.youtube.com/watch?v=${postId}`;
      default:
        return `https://${platform}.com/post/${postId}`;
    }
  }

  // Get publishing simulations for a campaign
  async getCampaignSimulations(campaignId: number) {
    return await db.select()
      .from(publishingSimulations)
      .where(eq(publishingSimulations.campaignId, campaignId));
  }

  // Update metrics for published simulations (simulates real-time engagement)
  async updateSimulationMetrics(simulationId: number) {
    const [simulation] = await db.select()
      .from(publishingSimulations)
      .where(eq(publishingSimulations.id, simulationId))
      .limit(1);

    if (!simulation || simulation.status !== 'published') {
      return null;
    }

    // Simulate metric growth over time
    const currentMetrics = simulation.metrics as any;
    const growthFactor = 1 + (Math.random() * 0.3); // 0-30% growth
    
    const updatedMetrics = {
      ...currentMetrics,
      views: Math.floor(currentMetrics.views * growthFactor),
      likes: Math.floor(currentMetrics.likes * growthFactor),
      comments: Math.floor(currentMetrics.comments * (1 + Math.random() * 0.2)),
      shares: Math.floor(currentMetrics.shares * (1 + Math.random() * 0.15)),
    };

    const [updated] = await db.update(publishingSimulations)
      .set({
        metrics: updatedMetrics,
        updatedAt: new Date(),
      })
      .where(eq(publishingSimulations.id, simulationId))
      .returning();

    return updated;
  }

  // Simulate scheduled posts going live
  async processScheduledPosts() {
    const now = new Date();
    
    const scheduledPosts = await db.select()
      .from(publishingSimulations)
      .where(eq(publishingSimulations.status, 'scheduled'));

    const results = [];
    
    for (const post of scheduledPosts) {
      if (post.scheduledFor && post.scheduledFor <= now) {
        const metrics = this.generateInitialMetrics(post.platform);
        
        const [updated] = await db.update(publishingSimulations)
          .set({
            status: 'published',
            publishedAt: now,
            metrics,
            updatedAt: now,
          })
          .where(eq(publishingSimulations.id, post.id))
          .returning();

        results.push(updated);
      }
    }

    return results;
  }
}

export const publishingSimulation = new PublishingSimulationService();