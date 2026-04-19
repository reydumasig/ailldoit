import axios from 'axios';
import { db } from '../db';
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

  // Normalised token shape used internally after any refresh / exchange.
  // Provider responses (snake_case) are mapped into this before being returned
  // so that refreshTokenIfNeeded can persist them uniformly.
  private normaliseTokenResponse(raw: any): { accessToken: string; refreshToken?: string; expiresIn?: number } {
    return {
      accessToken: raw.access_token ?? raw.accessToken,
      refreshToken: raw.refresh_token ?? raw.refreshToken ?? undefined,
      expiresIn: raw.expires_in ?? raw.expiresIn ?? undefined,
    };
  }

  // Refresh access token if it has expired (or is about to — we use a 60s
  // skew so in-flight requests don't race an expiry).
  async refreshTokenIfNeeded(connection: OAuthConnection): Promise<OAuthConnection> {
    const SKEW_MS = 60_000;
    if (!connection.expiresAt || connection.expiresAt.getTime() - SKEW_MS > Date.now()) {
      return connection; // Token is still valid
    }

    // Meta's "refresh" is actually a long-lived-token exchange using the
    // current access token, not a refresh_token grant.
    const tokenSource = connection.platform === 'meta' || connection.platform === 'facebook' || connection.platform === 'instagram'
      ? connection.accessToken
      : connection.refreshToken;

    if (!tokenSource) {
      throw new Error(`No token available to refresh ${connection.platform} connection`);
    }

    // Refresh token based on platform
    let tokenData: { accessToken: string; refreshToken?: string; expiresIn?: number };
    switch (connection.platform) {
      case 'meta':
      case 'facebook':
      case 'instagram':
        tokenData = await this.refreshMetaToken(tokenSource, connection);
        break;
      case 'tiktok':
        tokenData = await this.refreshTikTokToken(tokenSource);
        break;
      case 'youtube':
        tokenData = await this.refreshYouTubeToken(tokenSource);
        break;
      default:
        throw new Error(`Token refresh not implemented for platform: ${connection.platform}`);
    }

    if (!tokenData.accessToken) {
      throw new Error(`${connection.platform} refresh succeeded but returned no access token`);
    }

    // Update the connection with new tokens
    const [updated] = await db.update(oauthConnections)
      .set({
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken ?? connection.refreshToken,
        expiresAt: tokenData.expiresIn
          ? new Date(Date.now() + tokenData.expiresIn * 1000)
          : connection.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(oauthConnections.id, connection.id))
      .returning();

    return updated;
  }

  // Platform-specific token refresh methods.
  //
  // Meta does NOT implement OAuth2 refresh_token grants. Instead, long-lived
  // tokens are obtained by exchanging a (still-valid) access token with
  // grant_type=fb_exchange_token. This extends the token's lifetime to ~60d.
  // If the stored access token has already expired, the user must re-auth.
  private async refreshMetaToken(currentAccessToken: string, connection: OAuthConnection): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    // Pick the right app credentials based on which flow created the connection.
    const platformData = (connection.platformData as any) || {};
    const usedPublishing = platformData.flowType === 'publishing'
      || (platformData.grantedPermissions as string[] | undefined)?.some((s) => s.startsWith('pages_') || s.startsWith('instagram_'));
    const clientId = usedPublishing ? process.env.META_PUBLISHING_APP_ID : process.env.META_APP_ID;
    const clientSecret = usedPublishing ? process.env.META_PUBLISHING_APP_SECRET : process.env.META_APP_SECRET;

    const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: clientId,
        client_secret: clientSecret,
        fb_exchange_token: currentAccessToken,
      },
    });

    return this.normaliseTokenResponse(response.data);
  }

  // TikTok v1 endpoints were sunset; v2 uses form-encoded bodies at a new host.
  private async refreshTikTokToken(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    const body = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY || '',
      client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const response = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    // v2 returns the token data at the top level, not nested under `.data`.
    return this.normaliseTokenResponse(response.data);
  }

  private async refreshYouTubeToken(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
    });

    // Google only returns a new refresh_token on the *first* consent — for
    // subsequent refreshes, only access_token/expires_in come back. That's
    // why we fall back to connection.refreshToken in refreshTokenIfNeeded.
    return this.normaliseTokenResponse(response.data);
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