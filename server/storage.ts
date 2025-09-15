import {
  campaigns,
  users,
  assets,
  contentPerformance,
  learningPatterns,
  aiPromptTemplates,
  creditUsage,
  systemAnalytics,
  publishingSimulations,
  type Campaign,
  type User,
  type Asset,
  type InsertCampaign,
  type InsertUser,
  type InsertAsset,
  type UpsertUser,
  type ContentPerformance,
  type InsertContentPerformance,
  type LearningPattern,
  type InsertLearningPattern,
  type CreditUsage,
  type SystemAnalytics,
  type InsertCreditUsage,
  type InsertSystemAnalytics,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, count, sum, gte } from "drizzle-orm";

export interface IStorage {
  // User methods (Firebase Auth compatible)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateLastLogin(id: string): Promise<void>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  
  // Campaign methods (user-scoped)
  getCampaigns(userId: string): Promise<Campaign[]>;
  getCampaign(id: number, userId: string): Promise<Campaign | undefined>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: number, updates: Partial<Campaign>, userId: string): Promise<Campaign | undefined>;
  deleteCampaign(id: number, userId: string): Promise<boolean>;
  
  // Asset methods
  createAsset(asset: InsertAsset): Promise<Asset>;
  getAssets(campaignId: number): Promise<Asset[]>; // Alias for getAssetsByCampaign
  getAssetsByCampaign(campaignId: number): Promise<Asset[]>;
  updateAsset(assetId: number, updates: Partial<Asset>): Promise<Asset | undefined>;
  deleteAssetsByUser(userId: string): Promise<boolean>;
  
  // Learning and performance methods
  recordContentPerformance(data: InsertContentPerformance): Promise<ContentPerformance>;
  upsertLearningPattern(platform: string, language: string, contentType: string, patternType: string, patternData: any, performanceScore: number): Promise<LearningPattern>;
  getTopLearningPatterns(platform: string, language: string, contentType: string, limit: number): Promise<LearningPattern[]>;
  getPerformanceAnalytics(userId: string): Promise<any>;
  
  // Admin methods
  getAllUsers(): Promise<User[]>;
  getUserById(id: string): Promise<User | undefined>;
  updateUserRole(userId: string, role: string): Promise<User>;
  createCreditUsage(usage: InsertCreditUsage): Promise<CreditUsage>;
  getUserCreditUsage(userId: string, days?: number): Promise<CreditUsage[]>;
  getSystemStats(): Promise<any>;
  getUsersWithSubscriptionBreakdown(): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  // User methods (Firebase Auth compatible)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.firebaseUid, firebaseUid));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.email,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateLastLogin(id: string): Promise<void> {
    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, id));
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Campaign methods (user-scoped)
  async getCampaigns(userId: string): Promise<Campaign[]> {
    return await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.userId, userId))
      .orderBy(desc(campaigns.createdAt));
  }

  async getCampaign(id: number, userId: string): Promise<Campaign | undefined> {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)));
    return campaign;
  }

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    const [newCampaign] = await db
      .insert(campaigns)
      .values(campaign)
      .returning();
    return newCampaign;
  }

  async updateCampaign(id: number, updates: Partial<Campaign>, userId: string): Promise<Campaign | undefined> {
    const [updated] = await db
      .update(campaigns)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)))
      .returning();
    return updated;
  }

  async deleteCampaign(id: number, userId: string): Promise<boolean> {
    // First verify the campaign belongs to the user
    const campaign = await this.getCampaign(id, userId);
    if (!campaign) {
      return false;
    }

    // Delete related records in the correct order to avoid foreign key constraints
    console.log(`🗑️ Deleting campaign ${id} and all related data...`);
    
    // 1. Delete credit usage records
    await db.delete(creditUsage).where(eq(creditUsage.campaignId, id));
    console.log(`✅ Deleted credit usage records for campaign ${id}`);
    
    // 2. Delete content performance records
    await db.delete(contentPerformance).where(eq(contentPerformance.campaignId, id));
    console.log(`✅ Deleted content performance records for campaign ${id}`);
    
    // 3. Delete publishing simulations
    await db.delete(publishingSimulations).where(eq(publishingSimulations.campaignId, id));
    console.log(`✅ Deleted publishing simulations for campaign ${id}`);
    
    // 4. Delete assets
    await db.delete(assets).where(eq(assets.campaignId, id));
    console.log(`✅ Deleted assets for campaign ${id}`);
    
    // 5. Finally, delete the campaign itself
    const result = await db
      .delete(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.userId, userId)));
    
    const success = (result.rowCount ?? 0) > 0;
    if (success) {
      console.log(`✅ Successfully deleted campaign ${id}`);
    } else {
      console.error(`❌ Failed to delete campaign ${id}`);
    }
    
    return success;
  }

  // Asset methods
  async createAsset(asset: InsertAsset): Promise<Asset> {
    const [newAsset] = await db
      .insert(assets)
      .values(asset)
      .returning();
    return newAsset;
  }

  async regenerateMissingVideos(userId: string): Promise<{ fixed: number; total: number }> {
    console.log(`🔧 Checking for missing videos for user: ${userId}`);
    
    // Get all video assets for the user
    const videoAssets = await db
      .select()
      .from(assets)
      .innerJoin(campaigns, eq(assets.campaignId, campaigns.id))
      .where(and(eq(assets.type, "video"), eq(campaigns.userId, userId)));

    let fixed = 0;
    const total = videoAssets.length;

    for (const assetRow of videoAssets) {
      const asset = assetRow.assets;
      const campaign = assetRow.campaigns;
      
      // Check if video file exists
      const fs = await import('fs');
      const path = await import('path');
      const videoPath = path.join(process.cwd(), asset.url.startsWith('/') ? asset.url.substring(1) : asset.url);
      
      if (!fs.existsSync(videoPath)) {
        console.log(`❌ Missing video file: ${asset.url} for campaign: ${campaign.name}`);
        
        // Mark campaign as needing regeneration by updating status
        await db
          .update(campaigns)
          .set({ 
            status: "draft",
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaign.id));
        
        // Remove the broken asset record
        await db.delete(assets).where(eq(assets.id, asset.id));
        
        console.log(`✅ Reset campaign "${campaign.name}" for regeneration`);
        fixed++;
      }
    }

    console.log(`🔧 Video check complete: ${fixed}/${total} campaigns reset for regeneration`);
    return { fixed, total };
  }

  async auditAllVideoAssets(): Promise<{ 
    totalUsers: number; 
    totalAssets: number; 
    brokenAssets: number; 
    fixedCampaigns: number;
    affectedUsers: string[];
  }> {
    console.log(`🔍 Starting system-wide video asset audit...`);
    
    // Get all video assets across all users
    const videoAssets = await db
      .select({
        userId: campaigns.userId,
        userEmail: users.email,
        campaignId: campaigns.id,
        campaignName: campaigns.name,
        assetId: assets.id,
        assetUrl: assets.url
      })
      .from(assets)
      .innerJoin(campaigns, eq(assets.campaignId, campaigns.id))
      .innerJoin(users, eq(campaigns.userId, users.id))
      .where(eq(assets.type, "video"));

    const fs = await import('fs');
    const path = await import('path');
    
    let brokenAssets = 0;
    let fixedCampaigns = 0;
    const affectedUsers = new Set<string>();
    const userAssetCounts = new Map<string, number>();

    for (const asset of videoAssets) {
      // Count assets per user
      userAssetCounts.set(asset.userEmail, (userAssetCounts.get(asset.userEmail) || 0) + 1);
      
      // Check if video file exists
      const videoPath = path.join(process.cwd(), asset.assetUrl.startsWith('/') ? asset.assetUrl.substring(1) : asset.assetUrl);
      
      if (!fs.existsSync(videoPath)) {
        console.log(`❌ Missing video: ${asset.assetUrl} for user: ${asset.userEmail}, campaign: ${asset.campaignName}`);
        brokenAssets++;
        affectedUsers.add(asset.userEmail);
        
        // Reset campaign to draft status
        await db
          .update(campaigns)
          .set({ 
            status: "draft",
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, asset.campaignId));
        
        // Remove the broken asset record
        await db.delete(assets).where(eq(assets.id, asset.assetId));
        
        fixedCampaigns++;
        console.log(`✅ Fixed campaign "${asset.campaignName}" for user: ${asset.userEmail}`);
      }
    }

    const result = {
      totalUsers: userAssetCounts.size,
      totalAssets: videoAssets.length,
      brokenAssets,
      fixedCampaigns,
      affectedUsers: Array.from(affectedUsers)
    };

    console.log(`🔍 System audit complete:`, result);
    return result;
  }

  async getAssets(campaignId: number): Promise<Asset[]> {
    return this.getAssetsByCampaign(campaignId);
  }

  async getAssetsByCampaign(campaignId: number): Promise<Asset[]> {
    return await db
      .select()
      .from(assets)
      .where(eq(assets.campaignId, campaignId))
      .orderBy(desc(assets.createdAt));
  }

  async updateAsset(assetId: number, updates: Partial<Asset>): Promise<Asset | undefined> {
    const [updated] = await db
      .update(assets)
      .set(updates)
      .where(eq(assets.id, assetId))
      .returning();
    return updated;
  }

  async clearCampaignAssets(campaignId: number): Promise<void> {
    await db.delete(assets).where(eq(assets.campaignId, campaignId));
  }

  async deleteAssetsByUser(userId: string): Promise<boolean> {
    const result = await db
      .delete(assets)
      .where(eq(assets.userId, userId));
    return (result.rowCount ?? 0) > 0;
  }

  // Learning and performance methods
  async recordContentPerformance(data: InsertContentPerformance): Promise<ContentPerformance> {
    const [performance] = await db
      .insert(contentPerformance)
      .values(data)
      .returning();
    return performance;
  }

  async upsertLearningPattern(
    platform: string,
    language: string,
    contentType: string,
    patternType: string,
    patternData: any,
    performanceScore: number
  ): Promise<LearningPattern> {
    const existing = await db
      .select()
      .from(learningPatterns)
      .where(
        and(
          eq(learningPatterns.platform, platform),
          eq(learningPatterns.language, language),
          eq(learningPatterns.contentType, contentType),
          eq(learningPatterns.patternType, patternType),
          eq(learningPatterns.patternData, JSON.stringify(patternData))
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing pattern
      const pattern = existing[0];
      const newUsageCount = (pattern.usageCount || 0) + 1;
      const newAvgScore = Math.round(
        (pattern.avgPerformanceScore * (pattern.usageCount || 0) + performanceScore) / newUsageCount
      );

      const [updated] = await db
        .update(learningPatterns)
        .set({
          avgPerformanceScore: newAvgScore,
          usageCount: newUsageCount,
          lastUsed: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(learningPatterns.id, pattern.id))
        .returning();
      return updated;
    } else {
      // Create new pattern
      const [created] = await db
        .insert(learningPatterns)
        .values({
          platform,
          language,
          contentType,
          patternType,
          patternData,
          avgPerformanceScore: performanceScore,
          usageCount: 1,
          confidence: Math.min(100, performanceScore),
        })
        .returning();
      return created;
    }
  }

  async getTopLearningPatterns(
    platform: string,
    language: string,
    contentType: string,
    limit: number
  ): Promise<LearningPattern[]> {
    return await db
      .select()
      .from(learningPatterns)
      .where(
        and(
          eq(learningPatterns.platform, platform),
          eq(learningPatterns.language, language),
          eq(learningPatterns.contentType, contentType)
        )
      )
      .orderBy(desc(learningPatterns.avgPerformanceScore), desc(learningPatterns.usageCount))
      .limit(limit);
  }

  async getPerformanceAnalytics(userId: string): Promise<any> {
    const analytics = await db
      .select()
      .from(contentPerformance)
      .where(eq(contentPerformance.userId, userId))
      .orderBy(desc(contentPerformance.createdAt));

    const totalContent = analytics.length;
    const avgPerformanceScore = totalContent > 0
      ? Math.round(analytics.reduce((sum, item) => sum + (item.performanceScore || 0), 0) / totalContent)
      : 0;

    return {
      totalContent,
      avgPerformanceScore,
      topPerformingPlatforms: this.getTopPlatforms(analytics),
      recentPerformance: analytics.slice(0, 10),
    };
  }

  private getTopPlatforms(analytics: ContentPerformance[]): Array<{ platform: string; avgScore: number }> {
    const platformStats = analytics.reduce((acc, item) => {
      if (!acc[item.platform]) {
        acc[item.platform] = { total: 0, count: 0 };
      }
      acc[item.platform].total += (item.performanceScore || 0);
      acc[item.platform].count += 1;
      return acc;
    }, {} as Record<string, { total: number; count: number }>);

    return Object.entries(platformStats)
      .map(([platform, stats]) => ({
        platform,
        avgScore: Math.round(stats.total / stats.count),
      }))
      .sort((a, b) => b.avgScore - a.avgScore);
  }

  // Admin methods implementation
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUserRole(userId: string, role: string): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async createCreditUsage(usage: InsertCreditUsage): Promise<CreditUsage> {
    const [newUsage] = await db.insert(creditUsage).values(usage).returning();
    
    // Update user's total credits used
    await db
      .update(users)
      .set({ 
        creditsUsed: sql`${users.creditsUsed} + ${usage.creditsConsumed}`,
        updatedAt: new Date()
      })
      .where(eq(users.id, usage.userId));
    
    return newUsage;
  }

  async getUserCreditUsage(userId: string, days: number = 30): Promise<CreditUsage[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    return await db
      .select()
      .from(creditUsage)
      .where(and(
        eq(creditUsage.userId, userId),
        gte(creditUsage.createdAt, startDate)
      ))
      .orderBy(desc(creditUsage.createdAt));
  }

  async getSystemStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    newSignupsToday: number;
    totalCampaigns: number;
    campaignsToday: number;
    totalCreditsUsed: number;
    creditsUsedToday: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get total users
    const [totalUsersResult] = await db.select({ count: count() }).from(users);
    
    // Get active users (logged in within 30 days)
    const [activeUsersResult] = await db
      .select({ count: count() })
      .from(users)
      .where(and(
        eq(users.isActive, true),
        gte(users.lastLoginAt, thirtyDaysAgo)
      ));
    
    // Get new signups today
    const [newSignupsResult] = await db
      .select({ count: count() })
      .from(users)
      .where(gte(users.createdAt, today));
    
    // Get total campaigns
    const [totalCampaignsResult] = await db.select({ count: count() }).from(campaigns);
    
    // Get campaigns created today
    const [campaignsTodayResult] = await db
      .select({ count: count() })
      .from(campaigns)
      .where(gte(campaigns.createdAt, today));
    
    // Get total credits used
    const [totalCreditsResult] = await db
      .select({ total: sum(creditUsage.creditsConsumed) })
      .from(creditUsage);
    
    // Get credits used today
    const [creditsTodayResult] = await db
      .select({ total: sum(creditUsage.creditsConsumed) })
      .from(creditUsage)
      .where(gte(creditUsage.createdAt, today));

    return {
      totalUsers: totalUsersResult.count,
      activeUsers: activeUsersResult.count,
      newSignupsToday: newSignupsResult.count,
      totalCampaigns: totalCampaignsResult.count,
      campaignsToday: campaignsTodayResult.count,
      totalCreditsUsed: Number(totalCreditsResult.total) || 0,
      creditsUsedToday: Number(creditsTodayResult.total) || 0,
    };
  }

  async getUsersWithSubscriptionBreakdown(): Promise<{
    users: User[];
    subscriptionBreakdown: { [key: string]: number };
    platformBreakdown: { [key: string]: number };
  }> {
    const allUsers = await this.getAllUsers();
    
    // Calculate subscription breakdown
    const subscriptionBreakdown = allUsers.reduce((acc, user) => {
      const tier = user.subscriptionTier || 'free';
      acc[tier] = (acc[tier] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });
    
    // Get platform breakdown from campaigns
    const platformCounts = await db
      .select({
        platform: campaigns.platform,
        count: count()
      })
      .from(campaigns)
      .groupBy(campaigns.platform);
    
    const platformBreakdown = platformCounts.reduce((acc, item) => {
      acc[item.platform] = item.count;
      return acc;
    }, {} as { [key: string]: number });

    return {
      users: allUsers,
      subscriptionBreakdown,
      platformBreakdown,
    };
  }
}

export const storage = new DatabaseStorage();
