import axios from 'axios';
import { PublishingSettings } from '@shared/schema';
import { oauthService } from './oauth-service';

export class PublishingService {
  // Meta (Facebook/Instagram) API integration with OAuth
  async publishToMeta(userId: string, content: any, settings: PublishingSettings, platform: 'facebook' | 'instagram'): Promise<string> {
    try {
      // Get OAuth connection for user
      const connection = await oauthService.getPlatformConnection(userId, 'meta');
      if (!connection) {
        throw new Error('No Meta connection found. Please connect your account first.');
      }

      // Refresh token if needed
      const validConnection = await oauthService.refreshTokenIfNeeded(connection);
      const accessToken = validConnection.accessToken;

      // Get pages/accounts accessible with this token
      const pagesResponse = await axios.get(
        `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
      );
      
      const pageId = pagesResponse.data.data[0]?.id; // Use first available page
      if (!pageId) {
        throw new Error('No Facebook pages found for publishing');
      }

      const endpoint = platform === 'instagram' 
        ? `https://graph.facebook.com/v18.0/${pageId}/media`
        : `https://graph.facebook.com/v18.0/${pageId}/feed`;

      const postData = {
        access_token: accessToken,
        message: content.caption,
        ...(content.imageAssets?.[0] && { image_url: content.imageAssets[0] }),
        ...(content.videoAssets?.[0] && { video_url: content.videoAssets[0] }),
        published: settings.scheduleType === 'now',
        ...(settings.scheduledDate && settings.scheduledTime && {
          scheduled_publish_time: Math.floor(new Date(`${settings.scheduledDate}T${settings.scheduledTime}`).getTime() / 1000)
        })
      };

      const response = await axios.post(endpoint, postData);
      return response.data.id;
    } catch (error) {
      console.error('Meta publishing failed:', error);
      throw new Error('Failed to publish to Meta platforms');
    }
  }

  // TikTok API integration with OAuth
  async publishToTikTok(userId: string, content: any, settings: PublishingSettings): Promise<string> {
    try {
      // Get OAuth connection for user
      const connection = await oauthService.getPlatformConnection(userId, 'tiktok');
      if (!connection) {
        throw new Error('No TikTok connection found. Please connect your account first.');
      }

      // Refresh token if needed
      const validConnection = await oauthService.refreshTokenIfNeeded(connection);
      const accessToken = validConnection.accessToken;

      // TikTok requires video upload first
      if (!content.videoAssets?.[0]) {
        throw new Error('TikTok requires video content');
      }

      // Step 1: Initialize video upload
      const initResponse = await axios.post(
        'https://open-api.tiktok.com/share/video/upload/',
        {
          access_token: accessToken,
          video_url: content.videoAssets[0],
          text: content.caption,
          hashtag: content.hashtags.join(' '),
          privacy_level: 'EVERYONE',
          allows_duet: true,
          allows_stitch: true,
        }
      );

      return initResponse.data.share_id;
    } catch (error) {
      console.error('TikTok publishing failed:', error);
      throw new Error('Failed to publish to TikTok');
    }
  }

  // YouTube Shorts API integration with OAuth
  async publishToYouTube(userId: string, content: any, settings: PublishingSettings): Promise<string> {
    try {
      // Get OAuth connection for user
      const connection = await oauthService.getPlatformConnection(userId, 'youtube');
      if (!connection) {
        throw new Error('No YouTube connection found. Please connect your account first.');
      }

      // Refresh token if needed
      const validConnection = await oauthService.refreshTokenIfNeeded(connection);
      const accessToken = validConnection.accessToken;

      if (!content.videoAssets?.[0]) {
        throw new Error('YouTube requires video content');
      }

      const videoMetadata = {
        snippet: {
          title: content.hook.substring(0, 100), // YouTube title limit
          description: `${content.caption}\n\n${content.hashtags.join(' ')}`,
          tags: content.hashtags.map((tag: string) => tag.replace('#', '')),
          categoryId: '22', // People & Blogs category
        },
        status: {
          privacyStatus: 'public',
          publishAt: settings.scheduleType === 'scheduled' && settings.scheduledDate && settings.scheduledTime
            ? new Date(`${settings.scheduledDate}T${settings.scheduledTime}`).toISOString()
            : undefined,
        }
      };

      // Upload video to YouTube
      const response = await axios.post(
        'https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status',
        videoMetadata,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          }
        }
      );

      return response.data.id;
    } catch (error) {
      console.error('YouTube publishing failed:', error);
      throw new Error('Failed to publish to YouTube');
    }
  }

  // Main publishing orchestrator
  async publishCampaign(userId: string, campaignId: number, content: any, settings: PublishingSettings): Promise<{ platform: string; postId: string; status: string }[]> {
    const results = [];

    for (const platform of settings.connectedPlatforms) {
      try {
        let postId = '';
        
        switch (platform) {
          case 'facebook':
            postId = await this.publishToMeta(userId, content, settings, 'facebook');
            break;
          case 'instagram':
            postId = await this.publishToMeta(userId, content, settings, 'instagram');
            break;
          case 'tiktok':
            postId = await this.publishToTikTok(userId, content, settings);
            break;
          case 'youtube':
            postId = await this.publishToYouTube(userId, content, settings);
            break;
          default:
            throw new Error(`Unsupported platform: ${platform}`);
        }

        results.push({
          platform,
          postId,
          status: 'published'
        });
      } catch (error) {
        console.error(`Publishing to ${platform} failed:`, error);
        results.push({
          platform,
          postId: '',
          status: 'failed'
        });
      }
    }

    return results;
  }

  // Get publishing analytics
  async getPublishingAnalytics(platform: string, postId: string): Promise<any> {
    try {
      switch (platform) {
        case 'facebook':
        case 'instagram':
          return this.getMetaAnalytics(postId);
        case 'tiktok':
          return this.getTikTokAnalytics(postId);
        case 'youtube':
          return this.getYouTubeAnalytics(postId);
        default:
          throw new Error(`Analytics not supported for platform: ${platform}`);
      }
    } catch (error) {
      console.error('Analytics fetch failed:', error);
      return null;
    }
  }

  private async getMetaAnalytics(postId: string): Promise<any> {
    const accessToken = process.env.META_ACCESS_TOKEN;
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${postId}/insights?metric=post_impressions,post_clicks,post_reactions_total&access_token=${accessToken}`
    );
    return response.data;
  }

  private async getTikTokAnalytics(postId: string): Promise<any> {
    const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
    const response = await axios.get(
      `https://open-api.tiktok.com/research/video/query/?access_token=${accessToken}&video_id=${postId}`
    );
    return response.data;
  }

  private async getYouTubeAnalytics(videoId: string): Promise<any> {
    const accessToken = process.env.YOUTUBE_ACCESS_TOKEN;
    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`
    );
    return response.data;
  }
}

export const publishingService = new PublishingService();