import { pgTable, text, serial, integer, boolean, timestamp, json, varchar, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from 'drizzle-orm';

// Session storage table for authentication
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table with authentication fields
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  // Firebase Auth fields
  firebaseUid: varchar("firebase_uid").unique(),
  // Additional auth fields
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  // Admin and subscription fields
  role: text("role").default("user"), // 'user', 'admin', 'superadmin'
  subscriptionTier: text("subscription_tier").default("free"), // 'free', 'starter', 'growth', 'enterprise', 'beta'
  subscriptionStatus: text("subscription_status").default("active"), // 'active', 'inactive', 'cancelled', 'past_due'
  subscriptionStartDate: timestamp("subscription_start_date"),
  subscriptionEndDate: timestamp("subscription_end_date"),
  creditsUsed: integer("credits_used").default(0),
  creditsLimit: integer("credits_limit").default(100), // Monthly credit limit
  creditsRemaining: integer("credits_remaining").default(100),
  // Stripe integration fields
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  stripePriceId: varchar("stripe_price_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  description: text("description"), // Made optional
  platform: text("platform").notNull(), // 'tiktok', 'instagram', 'facebook'
  language: text("language").notNull(),
  status: text("status").notNull().default("draft"), // 'draft', 'generating', 'ready', 'published', 'active'
  brief: text("brief").notNull(),
  campaignType: text("campaign_type").notNull().default("video"), // 'video', 'image'
  referenceImageUrl: text("reference_image_url"), // Optional reference image for AI generation
  generatedContent: json("generated_content"), // AI generated content with real URLs
  variants: json("variants"), // A/B test variants
  publishingSettings: json("publishing_settings"), // Platform-specific settings
  publishingResults: json("publishing_results"), // Results from publishing to platforms
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Asset storage table for generated images and videos
export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => campaigns.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(), // 'image', 'video'
  provider: text("provider").notNull(), // 'gemini-imagen', 'gemini-veo', 'replicate-sdxl', 'openai-dalle'
  url: text("url").notNull(), // Original/temporary URL from AI provider
  // Video hosting fields for permanent storage
  hostedUrl: text("hosted_url"), // Permanent URL after hosting (Object Storage, Firebase, etc.)
  storageProvider: text("storage_provider"), // 'object-storage', 'firebase', 'local'
  hostingStatus: text("hosting_status").default("pending"), // 'pending', 'hosted', 'failed'
  hostingError: text("hosting_error"), // Error message if hosting failed
  metadata: json("metadata"), // Provider-specific metadata, dimensions, duration, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

// Performance Analytics table for tracking content performance
export const contentPerformance = pgTable("content_performance", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => campaigns.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  platform: text("platform").notNull(), // 'tiktok', 'instagram', 'facebook'
  language: text("language").notNull(),
  // Performance metrics
  views: integer("views").default(0),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  shares: integer("shares").default(0),
  clickThroughRate: integer("click_through_rate").default(0), // CTR percentage * 100
  engagementRate: integer("engagement_rate").default(0), // Engagement percentage * 100
  conversionRate: integer("conversion_rate").default(0), // Conversion percentage * 100
  // Content analysis
  contentType: text("content_type").notNull(), // 'hook', 'caption', 'hashtags', 'video_script'
  contentText: text("content_text").notNull(),
  contentFeatures: json("content_features"), // Extracted features (length, sentiment, keywords, etc.)
  performanceScore: integer("performance_score").default(0), // 0-100 composite score
  // Metadata
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Learning patterns table for storing high-performing content patterns
export const learningPatterns = pgTable("learning_patterns", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  language: text("language").notNull(),
  contentType: text("content_type").notNull(), // 'hook', 'caption', 'hashtags', 'video_script'
  // Pattern characteristics
  patternType: text("pattern_type").notNull(), // 'structure', 'sentiment', 'keywords', 'length'
  patternData: json("pattern_data").notNull(), // The actual pattern data
  // Performance metrics
  avgPerformanceScore: integer("avg_performance_score").notNull(),
  usageCount: integer("usage_count").default(1),
  successRate: integer("success_rate").default(0), // Percentage * 100
  // Learning metadata
  confidence: integer("confidence").default(0), // 0-100 confidence in pattern
  lastUsed: timestamp("last_used").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// AI prompt templates table for storing optimized prompts
export const aiPromptTemplates = pgTable("ai_prompt_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  platform: text("platform").notNull(),
  language: text("language").notNull(),
  contentType: text("content_type").notNull(),
  // Template data
  systemPrompt: text("system_prompt").notNull(),
  userPromptTemplate: text("user_prompt_template").notNull(),
  // Performance tracking
  avgPerformanceScore: integer("avg_performance_score").default(0),
  usageCount: integer("usage_count").default(0),
  successRate: integer("success_rate").default(0),
  // Template metadata
  version: integer("version").default(1),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// OAuth Connections table for social media platforms
export const oauthConnections = pgTable("oauth_connections", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  platform: text("platform").notNull(), // 'meta', 'tiktok', 'youtube'
  platformUserId: text("platform_user_id").notNull(), // User ID on the platform
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  scope: text("scope"), // Permissions granted
  platformData: json("platform_data"), // Additional platform-specific data
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Credit Usage Tracking table for monitoring token consumption
export const creditUsage = pgTable("credit_usage", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  actionType: text("action_type").notNull(), // 'text_generation', 'image_generation', 'video_generation'
  provider: text("provider").notNull(), // 'openai', 'gemini', 'replicate'
  creditsConsumed: integer("credits_consumed").notNull(),
  tokenCount: integer("token_count"), // Actual tokens used (for text generation)
  metadata: json("metadata"), // Additional details like model used, generation time, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

// System Analytics table for platform-wide statistics
export const systemAnalytics = pgTable("system_analytics", {
  id: serial("id").primaryKey(),
  date: timestamp("date").notNull().defaultNow(),
  totalUsers: integer("total_users").notNull().default(0),
  activeUsers: integer("active_users").notNull().default(0), // Users active in last 30 days
  newSignups: integer("new_signups").notNull().default(0), // New signups on this date
  totalCampaigns: integer("total_campaigns").notNull().default(0),
  campaignsCreated: integer("campaigns_created").notNull().default(0), // Campaigns created on this date
  totalCreditsUsed: integer("total_credits_used").notNull().default(0),
  creditsUsedToday: integer("credits_used_today").notNull().default(0),
  subscriptionBreakdown: json("subscription_breakdown"), // Count by tier: {free: 100, pro: 50, enterprise: 10}
  platformBreakdown: json("platform_breakdown"), // Usage by platform: {tiktok: 60, instagram: 30, facebook: 10}
  createdAt: timestamp("created_at").defaultNow(),
});

// Export types for new learning tables
export type ContentPerformance = typeof contentPerformance.$inferSelect;
export type InsertContentPerformance = typeof contentPerformance.$inferInsert;
export type LearningPattern = typeof learningPatterns.$inferSelect;
export type InsertLearningPattern = typeof learningPatterns.$inferInsert;
export type AIPromptTemplate = typeof aiPromptTemplates.$inferSelect;
export type InsertAIPromptTemplate = typeof aiPromptTemplates.$inferInsert;

// Export types for admin analytics tables
export type CreditUsage = typeof creditUsage.$inferSelect;
export type SystemAnalytics = typeof systemAnalytics.$inferSelect;

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAssetSchema = createInsertSchema(assets).omit({
  id: true,
  createdAt: true,
});

export const insertOAuthConnectionSchema = createInsertSchema(oauthConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCreditUsageSchema = createInsertSchema(creditUsage).omit({
  id: true,
  createdAt: true,
});

export const insertSystemAnalyticsSchema = createInsertSchema(systemAnalytics).omit({
  id: true,
  createdAt: true,
});

export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;
export type InsertOAuthConnection = z.infer<typeof insertOAuthConnectionSchema>;
export type OAuthConnection = typeof oauthConnections.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;
export type InsertCreditUsage = z.infer<typeof insertCreditUsageSchema>;
export type InsertSystemAnalytics = z.infer<typeof insertSystemAnalyticsSchema>;

// Additional types for generated content (now with real asset URLs)
export type GeneratedContent = {
  hook: string;
  caption: string;
  hashtags: string[];
  videoScript?: {
    timeframe: string;
    action: string;
  }[];
  imageAssets?: string[]; // Real URLs from storage
  videoAssets?: string[]; // Real URLs from storage
  assetIds?: number[]; // Reference to assets table
};

export type CampaignVariant = {
  id: string;
  name: string;
  hook: string;
  caption: string;
  selected: boolean;
};

export type PublishingSettings = {
  scheduleType: 'now' | 'scheduled';
  scheduledDate?: string;
  scheduledTime?: string;
  budget: number;
  targetAudience: string;
  duration: string;
  connectedPlatforms: string[];
};

// Publishing Simulations Table for MVP Demo
export const publishingSimulations = pgTable("publishing_simulations", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 50 }).notNull(), // facebook, instagram, tiktok, youtube
  status: varchar("status", { length: 20 }).notNull().default("scheduled"), // scheduled, published, failed
  scheduledFor: timestamp("scheduled_for").notNull(),
  publishedAt: timestamp("published_at"),
  simulationData: json("simulation_data").notNull(), // Mock API response data
  metrics: json("metrics"), // Simulated engagement metrics
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPublishingSimulationSchema = createInsertSchema(publishingSimulations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPublishingSimulation = z.infer<typeof insertPublishingSimulationSchema>;
export type PublishingSimulation = typeof publishingSimulations.$inferSelect;
