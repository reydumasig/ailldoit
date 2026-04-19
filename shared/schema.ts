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
  subscriptionTier: text("subscription_tier").default("free"), // 'free', 'starter', 'growth', 'enterprise'
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
  url: text("url").notNull(), // Storage URL (Firebase Storage, AWS S3, etc.)
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

// ============================================================================
// PHOTO MODULE (Real-estate AI photo editing — MVP v1.0)
// ============================================================================
// Additive schema. Does NOT touch campaigns/ad-generator tables.
// See MVP_PHOTO_PLAN.md for product scope.

// Organizations are the primary tenancy boundary for the photo module.
// Every user who touches /photos gets an auto-created "personal" org on
// first access so existing single-user accounts keep working without friction.
// Teams / agencies invite additional members via `organization_members`.
// Per PRD §7/§8: Phase 1 ships the data model + auto-personal-org; the full
// invite + QC UI lands in Phase 1.5 but the tables are correct from Day 1.
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: varchar("slug").unique().notNull(),
  createdByUserId: varchar("created_by_user_id").references(() => users.id).notNull(),
  isPersonal: boolean("is_personal").default(false), // auto-created personal org for a single user
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Join table for user ↔ org membership with role. A user can belong to
// multiple orgs (e.g. their personal org + an agency they work with).
// Roles per PRD: admin = full control; editor = run edits + QC approve;
// viewer = read-only access to projects + delivered downloads.
export const organizationMembers = pgTable("organization_members", {
  id: serial("id").primaryKey(),
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: text("role").notNull().default("admin"), // 'admin' | 'editor' | 'viewer'
  joinedAt: timestamp("joined_at").defaultNow(),
});

export type OrganizationRole = "admin" | "editor" | "viewer";

// Top-level container for a photographer's job on a property / shoot.
// Scoped to an org (Phase 1 per PRD) — userId retained as "who created it".
export const photoProjects = pgTable("photo_projects", {
  id: serial("id").primaryKey(),
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(), // created_by
  name: text("name").notNull(),                   // e.g. "123 Main St"
  addressLine: text("address_line"),              // optional, helps sort/search
  status: text("status").notNull().default("draft"), // 'draft' | 'ingesting' | 'processing' | 'ready' | 'delivered' | 'archived'
  settings: json("settings"),                     // per-project overrides (sky preset, style profile id, etc.)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// A set of photos that belong together as an HDR bracket. Detected
// heuristically from EXIF (capture time + exposure delta) then optionally
// confirmed by the user.
export const bracketGroups = pgTable("bracket_groups", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => photoProjects.id, { onDelete: "cascade" }).notNull(),
  captureTimeCenter: timestamp("capture_time_center"), // median capture time across the set
  photoCount: integer("photo_count").notNull().default(0),
  status: text("status").notNull().default("detected"), // 'detected' | 'confirmed' | 'merged'
  mergedAssetId: integer("merged_asset_id"),           // fk to photo_assets.id once merged (self-ref deferred to avoid circular)
  createdAt: timestamp("created_at").defaultNow(),
});

// Uploaded or derived photos. Source photos have sourceUrl set and jobId = null.
// Derived photos (HDR merged, sky-replaced, etc.) have derivedFromJobId set.
export const photoAssets = pgTable("photo_assets", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => photoProjects.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(), // denormalised for auth queries
  sourceUrl: text("source_url").notNull(),        // Firebase Storage URL
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  widthPx: integer("width_px"),
  heightPx: integer("height_px"),
  exifData: json("exif_data"),                    // parsed EXIF: captureTime, exposureTime, iso, fNumber, focalLength, cameraModel, etc.
  bracketGroupId: integer("bracket_group_id").references(() => bracketGroups.id, { onDelete: "set null" }),
  derivedFromJobId: integer("derived_from_job_id"), // fk to edit_jobs.id; null for user-uploaded originals
  isCover: boolean("is_cover").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Async work units — each edit operation is a job the worker picks up.
export const editJobs = pgTable("edit_jobs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => photoProjects.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  assetId: integer("asset_id").references(() => photoAssets.id, { onDelete: "cascade" }),          // nullable — for bracket merge jobs the input is bracketGroupId
  bracketGroupId: integer("bracket_group_id").references(() => bracketGroups.id, { onDelete: "cascade" }),
  jobType: text("job_type").notNull(),            // MVP: 'hdr_merge' | 'white_balance' | 'perspective' | 'window_pull' | 'sky_replace' | 'enhance' | 'pipeline_auto' — Phase 2 adds 'object_remove' | 'virtual_stage' | 'virtual_twilight'
  status: text("status").notNull().default("queued"), // 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  provider: text("provider"),                     // 'local' | 'replicate' | 'gemini' | etc.
  providerJobId: text("provider_job_id"),
  inputParams: json("input_params"),              // arbitrary per-job-type params (sky preset, removal mask coords, etc.)
  outputAssetId: integer("output_asset_id").references(() => photoAssets.id, { onDelete: "set null" }),
  costCents: integer("cost_cents"),               // our cost (not user price) for telemetry
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Version history per asset. Lets us keep prior edits and show diffs.
// Watermarked rows are free previews; non-watermarked rows are paid outputs.
export const editVersions = pgTable("edit_versions", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").references(() => photoAssets.id, { onDelete: "cascade" }).notNull(),
  jobId: integer("job_id").references(() => editJobs.id, { onDelete: "set null" }),
  versionNumber: integer("version_number").notNull(),
  outputUrl: text("output_url").notNull(),
  watermarked: boolean("watermarked").default(true),
  isCurrent: boolean("is_current").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Pay-on-download events. Drives billing; rows here = revenue events.
export const photoDownloads = pgTable("photo_downloads", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => photoProjects.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  versionId: integer("version_id").references(() => editVersions.id).notNull(),
  creditsCharged: integer("credits_charged").notNull().default(1),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  downloadedAt: timestamp("downloaded_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Saved per-user adjustment preferences ("Style Preferences" in AutoHDR parlance).
// Lets an account apply consistent looks across shoots.
export const photoStyleProfiles = pgTable("photo_style_profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").default(false),
  settings: json("settings").notNull(),           // { brightness, contrast, whiteBalance, vibrance, skyPreset, ... }
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Photo-specific credit ledger, kept SEPARATE from the existing ad-campaign
// credits on the users table. Prevents conflation of two product lines.
// Scoped to an org (Phase 1 per PRD) — credits belong to the team, not the
// individual member who happened to spend them. userId retained for audit.
export const photoCreditLedger = pgTable("photo_credit_ledger", {
  id: serial("id").primaryKey(),
  orgId: varchar("org_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id),  // audit: who triggered the debit/credit
  delta: integer("delta").notNull(),              // + for grants/purchases, - for spends
  balanceAfter: integer("balance_after").notNull(),
  reason: text("reason").notNull(),               // 'grant' | 'purchase' | 'download' | 'refund' | 'adjustment'
  refType: text("ref_type"),                      // e.g. 'photo_download' | 'stripe_checkout'
  refId: text("ref_id"),                          // flexible fk as string
  stripeChargeId: text("stripe_charge_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// --- Insert schemas + types for photo module ---
export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertOrganizationMemberSchema = createInsertSchema(organizationMembers).omit({
  id: true,
  joinedAt: true,
});
export const insertPhotoProjectSchema = createInsertSchema(photoProjects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertPhotoAssetSchema = createInsertSchema(photoAssets).omit({
  id: true,
  createdAt: true,
});
export const insertBracketGroupSchema = createInsertSchema(bracketGroups).omit({
  id: true,
  createdAt: true,
});
export const insertEditJobSchema = createInsertSchema(editJobs).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
});
export const insertEditVersionSchema = createInsertSchema(editVersions).omit({
  id: true,
  createdAt: true,
});
export const insertPhotoDownloadSchema = createInsertSchema(photoDownloads).omit({
  id: true,
  createdAt: true,
  downloadedAt: true,
});
export const insertPhotoStyleProfileSchema = createInsertSchema(photoStyleProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertPhotoCreditLedgerSchema = createInsertSchema(photoCreditLedger).omit({
  id: true,
  createdAt: true,
});

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type InsertOrganizationMember = z.infer<typeof insertOrganizationMemberSchema>;
export type PhotoProject = typeof photoProjects.$inferSelect;
export type InsertPhotoProject = z.infer<typeof insertPhotoProjectSchema>;
export type PhotoAsset = typeof photoAssets.$inferSelect;
export type InsertPhotoAsset = z.infer<typeof insertPhotoAssetSchema>;
export type BracketGroup = typeof bracketGroups.$inferSelect;
export type InsertBracketGroup = z.infer<typeof insertBracketGroupSchema>;
export type EditJob = typeof editJobs.$inferSelect;
export type InsertEditJob = z.infer<typeof insertEditJobSchema>;
export type EditVersion = typeof editVersions.$inferSelect;
export type InsertEditVersion = z.infer<typeof insertEditVersionSchema>;
export type PhotoDownload = typeof photoDownloads.$inferSelect;
export type InsertPhotoDownload = z.infer<typeof insertPhotoDownloadSchema>;
export type PhotoStyleProfile = typeof photoStyleProfiles.$inferSelect;
export type InsertPhotoStyleProfile = z.infer<typeof insertPhotoStyleProfileSchema>;
export type PhotoCreditLedgerEntry = typeof photoCreditLedger.$inferSelect;
export type InsertPhotoCreditLedgerEntry = z.infer<typeof insertPhotoCreditLedgerSchema>;

// Discriminated union of all possible edit job types so workers can switch
// safely on the jobType string. Kept as string-literal type to stay in sync
// with the Drizzle text column.
// MVP set — Phase 2 will extend this with 'object_remove', 'virtual_stage',
// 'virtual_twilight'. Do not add those here until the workers exist.
export type EditJobType =
  | "hdr_merge"
  | "white_balance"
  | "perspective"
  | "window_pull"
  | "sky_replace"
  | "enhance"        // brightness/contrast/vibrance/noise reduction pass
  | "pipeline_auto"; // full auto-pipeline orchestrator

export type PhotoProjectStatus =
  | "draft"
  | "ingesting"
  | "processing"
  | "ready"
  | "delivered"
  | "archived";

// Mirrors edit_jobs.status possible values. Workers move jobs through
// queued → running → succeeded|failed; cancelled is set if a user aborts
// before the worker picks it up.
export type EditJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";
