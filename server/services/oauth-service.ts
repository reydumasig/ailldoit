import axios from 'axios';
import { db } from '../db-gcp';
import { oauthConnections, type OAuthConnection, type InsertOAuthConnection } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export class OAuthService {
  // Meta (Facebook/Instagram) OAuth URLs and configuration
  private getMetaOAuthUrl(redirectUri: string, state: string, flowType: 'login' | 'publishing' = 'login'): string {
    const clientId = flowType === 'publishing' 
      ? process.env.META_PUBLISHING_APP_ID 
      : process.env.META_APP_ID;
    
    // Different scopes based on app purpose
    const scope = flowType === 'publishing' 
      ? 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish'
      : 'public_profile,email';
    
    const params = new URLSearchParams({
      client_id: clientId!,
      redirect_uri: redirectUri,
      scope,
      response_type: 'code',
      state,
    });

    return `https://www.facebook.com/v18.0/dialog/oauth?${params}`;
  }

  // TikTok OAuth URLs and configuration
  private getTikTokOAuthUrl(redirectUri: string, state: string): string {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const scope = 'user.info.basic,video.upload,video.publish';
    
    const params = new URLSearchParams({
      client_key: clientKey!,
      redirect_uri: redirectUri,
      scope,
      response_type: 'code',
      state,
    });

    return `https://www.tiktok.com/auth/authorize/?${params}`;
  }

  // YouTube OAuth URLs and configuration  
  private getYouTubeOAuthUrl(redirectUri: string, state: string): string {
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const scope = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube';
    
    const params = new URLSearchParams({
      client_id: clientId!,
      redirect_uri: redirectUri,
      scope,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  // Get OAuth URL for platform
  getOAuthUrl(platform: string, redirectUri: string, state: string, flowType: 'login' | 'publishing' = 'login'): string {
    switch (platform.toLowerCase()) {
      case 'meta':
      case 'facebook':
      case 'instagram':
        return this.getMetaOAuthUrl(redirectUri, state, flowType);
      case 'tiktok':
        return this.getTikTokOAuthUrl(redirectUri, state);
      case 'youtube':
        return this.getYouTubeOAuthUrl(redirectUri, state);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  // Exchange authorization code for access token - Meta
  async exchangeMetaCode(code: string, redirectUri: string, flowType: 'login' | 'publishing' = 'login'): Promise<any> {
    const clientId = flowType === 'publishing' ? process.env.META_PUBLISHING_APP_ID : process.env.META_APP_ID;
    const clientSecret = flowType === 'publishing' ? process.env.META_PUBLISHING_APP_SECRET : process.env.META_APP_SECRET;
    
    try {
      const response = await axios.post('https://graph.facebook.com/v18.0/oauth/access_token', {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      });

      // Get user info
      const userResponse = await axios.get(
        `https://graph.facebook.com/me?access_token=${response.data.access_token}&fields=id,name,email`
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        user: userResponse.data,
      };
    } catch (error) {
      console.error('Meta token exchange failed:', error);
      throw new Error('Failed to exchange Meta authorization code');
    }
  }

  // Exchange authorization code for access token - TikTok
  async exchangeTikTokCode(code: string, redirectUri: string): Promise<any> {
    try {
      const response = await axios.post('https://open-api.tiktok.com/oauth/access_token/', {
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      });

      // Get user info
      const userResponse = await axios.post('https://open-api.tiktok.com/user/info/', {
        access_token: response.data.data.access_token,
        open_id: response.data.data.open_id,
      });

      return {
        accessToken: response.data.data.access_token,
        refreshToken: response.data.data.refresh_token,
        expiresIn: response.data.data.expires_in,
        openId: response.data.data.open_id,
        user: userResponse.data.data.user,
      };
    } catch (error) {
      console.error('TikTok token exchange failed:', error);
      throw new Error('Failed to exchange TikTok authorization code');
    }
  }

  // Exchange authorization code for access token - YouTube
  async exchangeYouTubeCode(code: string, redirectUri: string): Promise<any> {
    try {
      const response = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: process.env.YOUTUBE_CLIENT_ID,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code,
      });

      // Get user info
      const userResponse = await axios.get(
        `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${response.data.access_token}`
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
        user: userResponse.data,
      };
    } catch (error) {
      console.error('YouTube token exchange failed:', error);
      throw new Error('Failed to exchange YouTube authorization code');
    }
  }

  // Save OAuth connection to database
  async saveConnection(userId: string, platform: string, tokenData: any): Promise<OAuthConnection> {
    const expiresAt = tokenData.expiresIn 
      ? new Date(Date.now() + tokenData.expiresIn * 1000)
      : null;

    const connectionData: InsertOAuthConnection = {
      userId,
      platform: platform.toLowerCase(),
      platformUserId: tokenData.user.id || tokenData.openId,
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken || null,
      expiresAt,
      scope: tokenData.scope || null,
      platformData: {
        user: tokenData.user,
        grantedPermissions: tokenData.scope?.split(',') || [],
      },
      isActive: true,
    };

    // Check if connection already exists and update it
    const existingConnection = await db.select()
      .from(oauthConnections)
      .where(and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.platform, platform.toLowerCase())
      ))
      .limit(1);

    if (existingConnection.length > 0) {
      const [updated] = await db.update(oauthConnections)
        .set({
          ...connectionData,
          updatedAt: new Date(),
        })
        .where(eq(oauthConnections.id, existingConnection[0].id))
        .returning();
      
      return updated;
    } else {
      const [created] = await db.insert(oauthConnections)
        .values(connectionData)
        .returning();
      
      return created;
    }
  }

  // Get user's OAuth connections
  async getUserConnections(userId: string): Promise<OAuthConnection[]> {
    return await db.select()
      .from(oauthConnections)
      .where(and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.isActive, true)
      ));
  }

  // Get specific platform connection
  async getPlatformConnection(userId: string, platform: string): Promise<OAuthConnection | null> {
    const connections = await db.select()
      .from(oauthConnections)
      .where(and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.platform, platform.toLowerCase()),
        eq(oauthConnections.isActive, true)
      ))
      .limit(1);

    return connections[0] || null;
  }

  // Refresh access token if needed
  async refreshTokenIfNeeded(connection: OAuthConnection): Promise<OAuthConnection> {
    if (!connection.expiresAt || connection.expiresAt > new Date()) {
      return connection; // Token is still valid
    }

    if (!connection.refreshToken) {
      throw new Error('No refresh token available for this connection');
    }

    // Refresh token based on platform
    let tokenData;
    switch (connection.platform) {
      case 'meta':
        tokenData = await this.refreshMetaToken(connection.refreshToken);
        break;
      case 'tiktok':
        tokenData = await this.refreshTikTokToken(connection.refreshToken);
        break;
      case 'youtube':
        tokenData = await this.refreshYouTubeToken(connection.refreshToken);
        break;
      default:
        throw new Error(`Token refresh not implemented for platform: ${connection.platform}`);
    }

    // Update the connection with new tokens
    const [updated] = await db.update(oauthConnections)
      .set({
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken || connection.refreshToken,
        expiresAt: tokenData.expiresIn 
          ? new Date(Date.now() + tokenData.expiresIn * 1000)
          : connection.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(oauthConnections.id, connection.id))
      .returning();

    return updated;
  }

  // Platform-specific token refresh methods
  private async refreshMetaToken(refreshToken: string): Promise<any> {
    const response = await axios.post('https://graph.facebook.com/v18.0/oauth/access_token', {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
    });

    return response.data;
  }

  private async refreshTikTokToken(refreshToken: string): Promise<any> {
    const response = await axios.post('https://open-api.tiktok.com/oauth/refresh_token/', {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
    });

    return response.data.data;
  }

  private async refreshYouTubeToken(refreshToken: string): Promise<any> {
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
    });

    return response.data;
  }

  // Disconnect a platform
  async disconnectPlatform(userId: string, platform: string): Promise<boolean> {
    const result = await db.update(oauthConnections)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.platform, platform.toLowerCase())
      ));

    return (result.rowCount || 0) > 0;
  }

  // Delete platform connection by platform user ID (for Facebook data deletion)
  async deletePlatformConnection(platform: string, platformUserId: string): Promise<boolean> {
    const result = await db.delete(oauthConnections)
      .where(and(
        eq(oauthConnections.platform, platform.toLowerCase()),
        eq(oauthConnections.platformUserId, platformUserId)
      ));

    return (result.rowCount || 0) > 0;
  }
}

export const oauthService = new OAuthService();