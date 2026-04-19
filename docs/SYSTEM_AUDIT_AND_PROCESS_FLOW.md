# Ailldoit System Audit & Process Flow Document

**Date:** January 2025  
**Status:** Production-Ready System  
**Last Updated:** January 2025 (Latest Audit)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Existing Features Audit](#existing-features-audit)
4. [Process Flows](#process-flows)
5. [System Architecture](#system-architecture)
6. [Recommendations](#recommendations)
7. [Technical Debt & Improvements](#technical-debt--improvements)

---

## Executive Summary

Ailldoit is a **production-ready AI-powered social media content generation platform** that transforms product briefs into viral, localized content for Southeast Asian markets. The system successfully combines multiple AI providers (OpenAI, Gemini, Replicate) with social media OAuth integration (Meta, TikTok, YouTube) and subscription-based billing (Stripe).

### Key Metrics
- **Features:** 100% MVP complete + Advanced Prompt Tools
- **API Endpoints:** 40+ production endpoints
- **Supported Platforms:** TikTok, Instagram, Facebook, YouTube
- **Languages:** 6 languages (Tagalog, Indonesian, Thai, Vietnamese, Malay, English)
- **Content Types:** Video, Image, Text (hooks, captions, hashtags)
- **Database Tables:** 11 production tables
- **Services:** 21 backend services

---

## System Overview

### Core Purpose
Transform product/service briefs into platform-optimized, language-localized social media content using AI, then publish directly to social media platforms.

### Technology Stack

#### Frontend
- **React 18** with TypeScript
- **Wouter** for routing
- **TanStack Query** for data fetching
- **Tailwind CSS** + **shadcn/ui** components
- **Firebase SDK** for authentication

#### Backend
- **Express.js** with TypeScript
- **PostgreSQL** via Drizzle ORM
- **Firebase Admin SDK** for JWT verification
- **Multi-provider AI** integration
- **Stripe SDK** for payments

#### Infrastructure
- **PostgreSQL** database (Neon serverless)
- **Firebase Storage** / Local storage for assets
- **Session Management** with PostgreSQL store
- **Environment-aware** configuration

---

## Existing Features Audit

### 1. Authentication & User Management ✅

**Status:** Complete & Production-Ready

**Features:**
- Firebase Authentication (Google OAuth + Email/Password)
- JWT token verification with server-side middleware
- User profiles (first name, last name, profile images)
- Role-based access control (User, Admin, Superadmin)
- Session management with PostgreSQL
- Secure token validation

**Files:**
- `client/src/contexts/AuthContext.tsx`
- `server/middleware/auth.ts`
- `client/src/pages/auth/login.tsx`, `register.tsx`

---

### 2. Campaign Management System ✅

**Status:** Complete with Full CRUD Operations

**Features:**
- Campaign creation with form-based brief submission
- Status workflow: Draft → Generating → Ready → Published → Active
- User-scoped data isolation
- Multi-platform support (TikTok, Instagram, Facebook)
- Campaign types (Video, Image)
- Multi-language support (6 languages)
- Campaign export/download
- A/B variant generation

**Files:**
- `client/src/pages/campaign-form.tsx`
- `client/src/pages/dashboard.tsx`
- `server/routes.ts` (Campaign CRUD endpoints)

**Database Schema:**
- `campaigns` table with JSON fields for generated content, variants, publishing settings

---

### 3. AI Content Generation Engine ✅

**Status:** Complete with Multi-Provider Support

**Features:**
- **Text Generation:** OpenAI GPT-4 Turbo for hooks, captions, hashtags
- **Image Generation:** Gemini Imagen 3.0 (8.6s generation time)
- **Video Generation:** Gemini Veo 3 with native audio support
- **Multi-Language:** 6 Southeast Asian languages + English
- **Learning System:** AI prompts improve based on performance data
- **Asset Storage:** Images/videos stored locally with database tracking
- **Fallback Providers:** Replicate SDXL available

**Files:**
- `server/services/ai-service.ts`
- `server/services/gemini-client.ts`
- `server/services/learning-service.ts`
- `client/src/pages/ai-generator.tsx`

**AI Providers:**
- ✅ OpenAI GPT-4 (Text generation)
- ✅ Gemini Imagen 3.0 (Image generation)
- ✅ Gemini Veo 3 (Video generation)
- ✅ Replicate SDXL (Fallback)

**Advanced Features:**
- Long video generation (15-60 seconds) with video stitching
- Video regeneration for expired assets
- Prompt-based image generation with semantic matching
- Custom prompt generation from campaign briefs

---

### 4. A/B Testing & Content Variants ✅

**Status:** Complete with Performance Tracking

**Features:**
- Automatic variant generation (multiple hooks per campaign)
- Performance tracking (views, likes, comments, shares, CTR, engagement)
- Content optimization based on learning patterns
- Variant selection interface
- Performance analytics dashboard

**Files:**
- `server/services/ab-testing-service.ts`
- `shared/schema.ts` (Content performance tables)

**Database Tables:**
- `contentPerformance` - Performance metrics
- `learningPatterns` - High-performing content patterns

---

### 5. Publishing & Social Media Integration ✅

**Status:** Complete with OAuth Flows

**Features:**
- Multi-platform OAuth (Meta/Facebook, Instagram, TikTok, YouTube)
- Publishing workflow with scheduling
- OAuth connection management
- Content export/download
- Platform-specific publishing settings
- Publishing result tracking
- Simulation mode for MVP demo

**Files:**
- `server/services/publishing-service.ts`
- `server/services/oauth-service.ts`
- `server/services/publishing-simulation.ts`
- `client/src/pages/publishing.tsx`
- `client/src/pages/oauth-connections-enhanced.tsx`

**OAuth Platforms:**
- Meta (Facebook/Instagram) - Login and Publishing flows
- TikTok
- YouTube

**OAuth Features:**
- Dual flow support (login vs publishing)
- State parameter security
- Token refresh handling
- Facebook data deletion callback (GDPR compliance)
- Connection management UI

---

### 6. Subscription & Billing System ✅

**Status:** Complete with Stripe Integration

**Features:**
- Stripe integration with environment-aware configuration
- Tiered subscription plans:
  - Free: 100 credits
  - Starter: $19.99/month (1,000 credits)
  - Growth: $49.99/month (5,000 credits)
  - Enterprise: Custom pricing (10,000+ credits)
- Real-time credit tracking
- Webhook processing for subscription updates
- Billing management portal

**Files:**
- `server/services/subscription-service.ts`
- `server/services/credit-tracking-service.ts`
- `client/src/components/subscription-modal.tsx`
- `server/config/environment.ts`

**Credit System:**
- Text generation: 1 credit
- Image generation: 5 credits
- Video generation: 15 credits (updated)
- Campaign generation: 8 credits total
- Content analysis: 1 credit

---

### 7. Admin & Analytics Dashboard ✅

**Status:** Complete with Superadmin Features

**Features:**
- Superadmin dashboard with system metrics
- User management and analytics
- Performance monitoring (real-time system load)
- Content analytics and learning insights
- Credit usage tracking
- System health monitoring

**Files:**
- `client/src/pages/SuperAdminDashboard.tsx`
- `server/services/performance-monitor.ts`
- `server/services/credit-tracking-service.ts`

**Analytics:**
- System-wide statistics
- User-level campaign analytics
- Performance metrics
- Concurrent user tracking

---

### 8. Learning & Optimization System ✅

**Status:** Complete with AI-Based Learning

**Features:**
- Performance data recording
- Pattern recognition from high-performing content
- AI prompt optimization based on performance
- Learning pattern storage
- Prompt template management

**Files:**
- `server/services/learning-service.ts`
- `server/services/brief-template-service.ts`
- `shared/schema.ts` (Learning tables)

**Database Tables:**
- `learningPatterns` - Performance patterns
- `aiPromptTemplates` - Optimized prompts
- `contentPerformance` - Performance metrics

---

### 9. Asset Management ✅

**Status:** Complete with Local Storage

**Features:**
- Generated asset storage (images, videos)
- Asset metadata tracking
- Asset migration service for expired videos
- Asset validation service
- Video processing and stitching service

**Files:**
- `server/services/firebase-storage-service.ts`
- `server/services/storage-service.ts`
- `server/services/campaign-migration-service.ts`
- `server/services/asset-validation-service.ts`
- `server/services/video-processing-service.ts`

**Database Table:**
- `assets` - Generated images/videos with metadata

**Features:**
- Local and Firebase storage support
- Asset migration for expired videos
- Video regeneration endpoint
- Long video generation (15+ seconds) with stitching
- Asset validation and status checking
- Bulk migration for user campaigns

---

### 10. Rate Limiting & Performance Monitoring ✅

**Status:** Complete with Multi-Tier Limits

**Features:**
- API rate limiting (general, auth, AI generation)
- Performance monitoring (response times, error rates)
- System capacity assessment
- Concurrent user tracking

**Files:**
- `server/services/rate-limiting-service.ts`
- `server/services/performance-monitor.ts`

---

### 11. Prompt Selector Tool ✅

**Status:** Complete with Advanced Prompt Management

**Features:**
- Comprehensive prompt template library (10+ categories)
- Filtered prompt search (category, shot type, tone, subject, difficulty)
- Guided prompt builder with AI generation
- Prompt remix and customization
- Inspiration feed with trending prompts
- Random prompt generation
- Prompt rating and usage tracking

**Files:**
- `server/services/prompt-selector-service.ts`
- `client/src/components/PromptSelectorTool.tsx`

**API Endpoints:**
- `GET /api/prompts/templates` - Get filtered prompt templates
- `GET /api/prompts/options` - Get categories and filter options
- `GET /api/prompts/inspiration` - Get inspiration feed
- `POST /api/prompts/guided` - Generate guided prompt
- `POST /api/prompts/random` - Generate random prompts
- `POST /api/prompts/remix` - Remix existing prompt

**Prompt Categories:**
- Nature & Landscapes
- Urban & Architecture
- Fantasy & Surreal
- Portrait & Characters
- Abstract & Artistic
- Product & Commercial
- Emotional & Dramatic
- Minimalist & Clean
- Vintage & Retro
- Futuristic & Sci-Fi

---

### 12. Linked Prompt Service ✅

**Status:** Complete with Semantic Matching

**Features:**
- AI-powered brief analysis
- Semantic matching of campaign briefs to visual prompts
- Custom prompt generation based on brief content
- Industry-specific prompt blocks (skincare, food, tech, etc.)
- Platform and audience-aware suggestions
- Multi-language support

**Files:**
- `server/services/linked-prompt-service.ts`
- `client/src/components/LinkedPromptSuggestions.tsx`

**API Endpoints:**
- `POST /api/prompts/link-suggestions` - Get linked prompt suggestions for brief

**Features:**
- Brief analysis (category, audience, platform, tone, style, keywords)
- Matched prompt suggestions from library
- AI-generated custom prompts
- Industry-specific prompt blocks
- Visual vibe and motion type matching

---

## Process Flows

### Flow 1: User Registration & Onboarding

```
┌─────────────────┐
│  User Visits    │
│   Application   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Authentication │
│   Page (Login/  │
│    Register)    │
└────────┬────────┘
         │
    ┌────┴────┐
    │        │
    ▼        ▼
┌─────────┐  ┌──────────┐
│  Google │  │  Email/   │
│   OAuth │  │  Password │
└────┬────┘  └─────┬──────┘
     │            │
     └─────┬──────┘
           │
           ▼
┌─────────────────┐
│  Firebase Auth  │
│   Verification  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  JWT Token      │
│   Generation    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Server Token   │
│   Verification  │
│  (Firebase Admin│
│      SDK)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  User Created/  │
│   Retrieved in  │
│   PostgreSQL    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Free Tier      │
│  Account Setup  │
│  (100 credits)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Dashboard      │
│  (Campaign      │
│   Overview)     │
└─────────────────┘
```

**Key Steps:**
1. User accesses application
2. Redirected to authentication page
3. User chooses Google OAuth or email/password
4. Firebase Auth creates/verifies user
5. JWT token generated and sent to client
6. Client sends token to server for verification
7. Server verifies token with Firebase Admin SDK
8. User created/retrieved in PostgreSQL database
9. Free tier account automatically created
10. User redirected to dashboard

**API Endpoints:**
- `POST /api/auth/verify` - Token verification
- `GET /api/dashboard/stats` - Dashboard data

---

### Flow 2: Campaign Creation & AI Generation

```
┌─────────────────┐
│  User Clicks    │
│  "New Campaign"│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Campaign Form  │
│  - Name         │
│  - Description  │
│  - Platform     │
│  - Language     │
│  - Type         │
│  - Brief        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Form Validation│
│  (Client-side)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  POST /api/     │
│  campaigns      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Campaign Saved │
│  (Status: Draft)│
│  in PostgreSQL  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  User Clicks    │
│  "Generate AI   │
│   Content"      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Credit Check   │
│  (Pre-validation)│
└────────┬────────┘
         │
    ┌────┴────┐
    │        │
    ▼        ▼
┌─────────┐  ┌──────────┐
│ Enough  │  │  Insufficient│
│ Credits │  │  Credits     │
└────┬────┘  └─────┬──────┘
     │            │
     │            ▼
     │      ┌──────────────┐
     │      │ Show Error  │
     │      │  & Upgrade  │
     │      │   Prompt    │
     │      └──────────────┘
     │
     ▼
┌─────────────────┐
│  Campaign Status│
│  Updated to     │
│  "Generating"   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AI Service     │
│  Orchestration  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌─────────┐ ┌──────────┐
│  Text    │ │  Image/  │
│  Gen     │ │  Video   │
│ (GPT-4)  │ │  Gen     │
└────┬────┘ │ (Gemini)  │
     │      └─────┬─────┘
     │            │
     └─────┬──────┘
           │
           ▼
┌─────────────────┐
│  Learning System│
│  Optimization    │
│  (Enhanced      │
│   Prompts)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Content        │
│  Generated      │
│  - Hook         │
│  - Caption      │
│  - Hashtags     │
│  - Images       │
│  - Videos       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Assets Stored  │
│  (Local/Firebase│
│   Storage)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  A/B Variants   │
│  Generated      │
│  (3 variants)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Campaign       │
│  Updated:       │
│  Status: Ready  │
│  Generated      │
│  Content Saved  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Credits        │
│  Deducted       │
│  - Text: 1     │
│  - Image: 5     │
│  - Video: 10   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  User Sees      │
│  Generated      │
│  Content        │
└─────────────────┘
```

**Key Steps:**
1. User fills campaign form
2. Campaign saved as Draft in database
3. User clicks "Generate AI Content"
4. System checks user credits (pre-validation)
5. Campaign status updated to "Generating"
6. AI service orchestrates content generation:
   - Text generation (OpenAI GPT-4)
   - Image/Video generation (Gemini)
7. Learning system optimizes prompts
8. Generated content structured (hook, caption, hashtags, media)
9. Assets stored in local/Firebase storage
10. A/B variants automatically generated
11. Campaign updated with generated content
12. Credits deducted from user account
13. User views generated content

**API Endpoints:**
- `POST /api/campaigns` - Create campaign
- `POST /api/campaigns/:id/generate` - Generate AI content
- `GET /api/campaigns/:id` - Retrieve campaign with content
- `POST /api/campaigns/:id/regenerate-video` - Regenerate expired videos
- `POST /api/campaigns/:id/generate-long-video` - Generate long videos (15+ seconds)
- `POST /api/campaigns/:id/migrate-assets` - Migrate campaign assets
- `GET /api/campaigns/:id/migration-status` - Check migration status
- `POST /api/campaigns/migrate-all` - Migrate all user campaigns

---

### Flow 3: Publishing to Social Media Platforms

```
┌─────────────────┐
│  User Selects   │
│  Campaign       │
│  (Status: Ready)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  User Clicks    │
│  "Publish"      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Check OAuth    │
│  Connections    │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌─────────┐  ┌──────────┐
│ Connected│  │  Not     │
│ Platform │  │  Connected│
└────┬────┘  └─────┬──────┘
     │            │
     │            ▼
     │      ┌──────────────┐
     │      │ Redirect to  │
     │      │ OAuth Connect│
     │      │  Page        │
     │      └──────────────┘
     │
     ▼
┌─────────────────┐
│  User Selects   │
│  Platforms      │
│  - Facebook     │
│  - Instagram    │
│  - TikTok       │
│  - YouTube      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  User Sets      │
│  Publishing     │
│  Settings       │
│  - Schedule     │
│  - Budget       │
│  - Audience     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Content        │
│  Validation     │
│  - Format       │
│  - Size         │
│  - Duration     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  POST /api/     │
│  campaigns/:id  │
│  /publish       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Publishing     │
│  Service        │
│  Orchestration  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌─────────┐ ┌──────────┐
│  Meta   │ │  TikTok/  │
│ (FB/IG) │ │  YouTube  │
└────┬────┘ └─────┬─────┘
     │            │
     ▼            ▼
┌─────────────────┐
│  OAuth Token    │
│  Retrieval      │
│  & Refresh      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Platform API  │
│  Publishing     │
│  (Graph API/    │
│   TikTok API)   │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌─────────┐ ┌──────────┐
│ Success │ │  Failure  │
└────┬────┘ └─────┬──────┘
     │            │
     │            ▼
     │      ┌──────────────┐
     │      │ Error        │
     │      │ Handling     │
     │      └──────────────┘
     │
     ▼
┌─────────────────┐
│  Publishing     │
│  Results Saved  │
│  - Post ID      │
│  - Status       │
│  - Timestamp    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Campaign       │
│  Status:        │
│  Published      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  User Sees      │
│  Results        │
│  Dashboard      │
└─────────────────┘
```

**Key Steps:**
1. User selects ready campaign
2. System checks OAuth connections
3. If not connected, redirect to OAuth connection page
4. User selects target platforms
5. User configures publishing settings
6. Content validation (format, size, duration)
7. Publishing service orchestrates platform-specific publishing
8. OAuth tokens retrieved and refreshed if needed
9. Platform APIs called (Meta Graph API, TikTok API, etc.)
10. Publishing results saved to database
11. Campaign status updated to "Published"
12. User views results dashboard

**API Endpoints:**
- `GET /api/auth/connections` - Check OAuth connections
- `POST /api/auth/:platform/connect` - Initiate OAuth
- `POST /api/campaigns/:id/publish` - Publish campaign
- `GET /api/campaigns/:id/simulations` - Publishing results
- `GET /api/domain-info` - Domain configuration info
- `GET /api/oauth-test/:platform` - Test OAuth URL generation
- `POST /auth/facebook/data-deletion` - Facebook data deletion callback
- `GET /auth/facebook/data-deletion-status` - Data deletion status

---

### Flow 4: A/B Testing & Performance Learning

```
┌─────────────────┐
│  Campaign       │
│  Generated      │
│  with Variants   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  User Views     │
│  Variants       │
│  (3 options)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  User Selects   │
│  Best Variant   │
│  or AI          │
│  Recommends     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Variant        │
│  Published to   │
│  Social Media   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Performance    │
│  Metrics        │
│  Collected      │
│  - Views        │
│  - Likes        │
│  - Comments     │
│  - Shares       │
│  - CTR          │
│  - Engagement   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Performance    │
│  Data Recorded  │
│  in Database    │
│  (content       │
│  Performance    │
│   table)        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Learning       │
│  Service        │
│  Analyzes       │
│  Patterns       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  High-Performing│
│  Patterns       │
│  Identified     │
│  - Structure    │
│  - Sentiment    │
│  - Keywords     │
│  - Length       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Patterns       │
│  Stored in      │
│  Learning       │
│  Patterns Table │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AI Prompts     │
│  Optimized      │
│  Based on       │
│  Patterns       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Next Campaign  │
│  Uses Enhanced  │
│  Prompts        │
└─────────────────┘
```

**Key Steps:**
1. Campaign generated with multiple variants
2. User reviews and selects best variant
3. Selected variant published to social media
4. Performance metrics collected from platforms
5. Performance data recorded in database
6. Learning service analyzes patterns
7. High-performing patterns identified
8. Patterns stored in learning database
9. AI prompts optimized based on patterns
10. Future campaigns use enhanced prompts

**API Endpoints:**
- `PATCH /api/campaigns/:id/variants` - Select variant
- `POST /api/campaigns/:id/performance` - Record performance
- `GET /api/analytics/performance` - View analytics

---

### Flow 5: Subscription & Credit Management

```
┌─────────────────┐
│  User Runs Out  │
│  of Credits     │
│  or Needs More  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  User Clicks    │
│  "Upgrade" or   │
│  "View Plans"   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Subscription   │
│  Modal Shows    │
│  Plans          │
│  - Free (100)   │
│  - Starter ($19)│
│  - Growth ($49) │
│  - Enterprise   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  User Selects   │
│  Plan & Stripe  │
│  Checkout       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  POST /api/     │
│  subscription/  │
│  create         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Stripe Customer│
│  Created/       │
│  Retrieved      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Stripe         │
│  Subscription   │
│  Created        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Webhook        │
│  Processing     │
│  (Subscription  │
│   created)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  User Record    │
│  Updated in     │
│  Database       │
│  - Tier         │
│  - Credits      │
│  - Status       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Credit Usage   │
│  Tracking       │
│  - Campaign Gen │
│  - Image Gen    │
│  - Video Gen    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Real-time      │
│  Credit Display │
│  Updated        │
└─────────────────┘
```

**Key Steps:**
1. User needs more credits or hits limit
2. User opens subscription modal
3. User selects plan and proceeds to Stripe checkout
4. Subscription created in Stripe
5. Webhook received and processed
6. User record updated in database
7. Credits allocated based on plan
8. Credit usage tracked for all operations
9. Real-time credit display updated

**API Endpoints:**
- `GET /api/subscription/plans` - Get available plans
- `POST /api/subscription/create` - Create subscription
- `POST /api/webhooks/stripe` - Stripe webhook handler
- `GET /api/subscription/current` - Current subscription status
- `POST /api/subscription/cancel` - Cancel subscription
- `POST /api/subscription/portal` - Create Stripe portal session

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   React App  │  │  Firebase    │  │  Stripe      │    │
│  │   (React 18) │  │  Auth SDK    │  │  Elements    │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │ HTTPS / REST API
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                      API LAYER                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Express.js Server (TypeScript)               │  │
│  │  ┌──────────────┐  ┌──────────────┐                 │  │
│  │  │  Auth        │  │  Rate        │                 │  │
│  │  │  Middleware  │  │  Limiting    │                 │  │
│  │  └──────────────┘  └──────────────┘                 │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    SERVICE LAYER                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  AI Service  │  │  Publishing   │  │  Subscription │   │
│  └──────────────┘  │  Service     │  └──────────────┘   │
│  ┌──────────────┐  └──────────────┘  ┌──────────────┐   │
│  │  Learning    │  ┌──────────────┐  │  OAuth       │   │
│  │  Service     │  │  Storage      │  │  Service     │   │
│  └──────────────┘  │  Service     │  └──────────────┘   │
│                    └──────────────┘                     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    DATA LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  PostgreSQL  │  │  Firebase     │  │  Local       │   │
│  │  (Drizzle)   │  │  Storage      │  │  Storage     │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
                               │
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                EXTERNAL SERVICE LAYER                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  OpenAI      │  │  Gemini      │  │  Stripe      │   │
│  │  (GPT-4)     │  │  (Imagen/Veo)│  │  (Payments)  │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Replicate   │  │  Meta Graph  │  │  TikTok API  │   │
│  │  (SDXL)      │  │  API         │  │              │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema Overview

**Core Tables:**
1. **users** - User accounts, subscriptions, credits
2. **campaigns** - Campaign data, generated content, variants
3. **assets** - Generated images/videos with metadata
4. **oauthConnections** - Social media OAuth tokens
5. **sessions** - Authentication session storage

**Analytics Tables:**
6. **contentPerformance** - Performance metrics
7. **learningPatterns** - AI learning patterns
8. **aiPromptTemplates** - Optimized prompts
9. **creditUsage** - Credit consumption tracking
10. **systemAnalytics** - System-wide statistics

**Publishing Tables:**
11. **publishingSimulations** - Publishing results

**Note:** All tables use PostgreSQL with Drizzle ORM for type-safe queries

---

## Recommendations

### 1. Immediate Improvements (High Priority)

#### 1.1 Cloud Storage Migration
**Current State:** Videos stored locally on server filesystem  
**Recommendation:** Migrate to cloud storage (Firebase Storage or AWS S3)

**Benefits:**
- Better scalability
- Permanent asset URLs
- Reduced server storage burden
- CDN capabilities for faster delivery

**Implementation Steps:**
1. Configure Firebase Storage bucket or AWS S3 bucket
2. Update `firebase-storage-service.ts` to handle video uploads
3. Migrate existing local videos to cloud storage
4. Update asset URLs in database
5. Remove local storage dependency

**Priority:** High  
**Effort:** Medium (2-3 days)

---

#### 1.2 Enhanced Error Handling & Retry Logic
**Current State:** Basic error handling with fallbacks  
**Recommendation:** Implement comprehensive retry logic for AI providers

**Benefits:**
- Better resilience to API failures
- Improved user experience
- Reduced failed generations

**Implementation Steps:**
1. Add exponential backoff for API retries
2. Implement circuit breaker pattern
3. Add detailed error logging and monitoring
4. Create user-friendly error messages

**Priority:** High  
**Effort:** Medium (2-3 days)

---

#### 1.3 Performance Monitoring Dashboard
**Current State:** Basic performance monitoring  
**Recommendation:** Build comprehensive monitoring dashboard

**Benefits:**
- Real-time system health visibility
- Proactive issue detection
- Performance optimization insights

**Implementation Steps:**
1. Extend `performance-monitor.ts` with more metrics
2. Create admin dashboard for monitoring
3. Add alerting for critical thresholds
4. Implement log aggregation

**Priority:** Medium  
**Effort:** High (5-7 days)

---

### 2. Feature Enhancements (Medium Priority)

#### 2.1 Advanced Analytics & Reporting
**Current State:** Basic performance tracking  
**Recommendation:** Build comprehensive analytics dashboard

**Features:**
- Campaign performance comparison
- Platform-specific analytics
- Content type performance analysis
- Trend analysis over time
- Export capabilities (PDF, CSV)

**Priority:** Medium  
**Effort:** High (7-10 days)

---

#### 2.2 Batch Campaign Operations
**Current State:** Single campaign operations  
**Recommendation:** Support batch campaigns

**Features:**
- Bulk campaign creation
- Batch content generation
- Bulk publishing
- Template-based campaign creation

**Priority:** Medium  
**Effort:** Medium (3-5 days)

---

#### 2.3 Content Library & Templates
**Current State:** Ad-hoc campaign creation  
**Recommendation:** Build content library system

**Features:**
- Reusable content templates
- Campaign templates by industry
- Asset library management
- Template marketplace

**Priority:** Medium  
**Effort:** High (7-10 days)

---

#### 2.4 Multi-Account Management
**Current State:** Single account per user  
**Recommendation:** Support multiple accounts/organizations

**Features:**
- Organization/team accounts
- Role-based permissions
- Shared campaigns
- Team collaboration

**Priority:** Low  
**Effort:** High (10-14 days)

---

### 3. Technical Improvements (Ongoing)

#### 3.1 Code Quality & Testing
**Recommendations:**
- Add unit tests for critical services (AI, Publishing, Subscription)
- Implement integration tests for API endpoints
- Add E2E tests for key user flows
- Set up CI/CD pipeline with automated testing

**Priority:** High  
**Effort:** Ongoing

---

#### 3.2 Documentation
**Recommendations:**
- API documentation (OpenAPI/Swagger)
- Component library documentation
- Deployment runbooks
- Troubleshooting guides
- Architecture decision records (ADRs)

**Priority:** Medium  
**Effort:** Ongoing

---

#### 3.3 Security Enhancements
**Recommendations:**
- Implement request signing for webhooks
- Add rate limiting per user tier
- Implement API key authentication for integrations
- Add data encryption at rest
- Security audit and penetration testing

**Priority:** High  
**Effort:** Medium (5-7 days)

---

#### 3.4 Database Optimization
**Recommendations:**
- Add indexes for frequently queried fields
- Implement database connection pooling optimization
- Add query performance monitoring
- Optimize JSON field queries
- Consider read replicas for analytics queries

**Priority:** Medium  
**Effort:** Medium (3-5 days)

---

### 4. Scalability Improvements (Long-term)

#### 4.1 Background Job Processing
**Current State:** Synchronous AI generation  
**Recommendation:** Implement queue-based processing

**Benefits:**
- Better handling of long-running tasks
- Improved user experience (no blocking)
- Better resource utilization
- Retry capabilities for failed jobs

**Technology Options:**
- Bull (Redis-based queue)
- AWS SQS
- Google Cloud Tasks

**Priority:** Medium  
**Effort:** High (7-10 days)

---

#### 4.2 Caching Strategy
**Current State:** Direct database queries  
**Recommendation:** Implement multi-layer caching

**Benefits:**
- Faster response times
- Reduced database load
- Better scalability

**Implementation:**
- Redis for session and frequently accessed data
- CDN for static assets
- Application-level caching for templates

**Priority:** Medium  
**Effort:** Medium (5-7 days)

---

#### 4.3 Microservices Architecture
**Current State:** Monolithic Express application  
**Recommendation:** Consider microservices for scale

**When to Consider:**
- When specific services need independent scaling
- When team size grows significantly
- When services have different technology requirements

**Priority:** Low (Future consideration)  
**Effort:** Very High (3-4 weeks)

---

## Technical Debt & Improvements

### Current Technical Debt

#### 1. Video Expiration Issues
**Problem:** Gemini-generated videos expire after 30 minutes  
**Status:** ✅ Resolved with migration service and regeneration endpoints  
**Solution Implemented:**
- Campaign migration service for bulk asset migration
- Video regeneration endpoint (`/api/campaigns/:id/regenerate-video`)
- Migration status checking endpoint
- Bulk migration for all user campaigns
**Remaining Work:** Complete migration to cloud storage (Firebase Storage or AWS S3)

---

#### 2. Asset URL Management
**Problem:** Mixed asset storage (local + Firebase)  
**Solution:** Unified storage service  
**Priority:** High

---

#### 3. Error Handling Consistency
**Problem:** Inconsistent error handling across services  
**Solution:** Standardized error handling middleware  
**Priority:** Medium

---

#### 4. Testing Coverage
**Problem:** Limited automated tests  
**Solution:** Comprehensive test suite  
**Priority:** High

---

#### 5. API Documentation
**Problem:** No formal API documentation  
**Solution:** OpenAPI/Swagger documentation  
**Priority:** Medium

---

### Code Quality Recommendations

#### 1. Type Safety
- ✅ Good TypeScript usage throughout
- ⚠️ Some `any` types in error handling (should be refined)
- ⚠️ JSON fields could use stronger typing

#### 2. Error Handling
- ✅ Basic error handling in place
- ⚠️ Could benefit from custom error classes
- ⚠️ Error logging could be more structured

#### 3. Code Organization
- ✅ Well-organized service layer
- ✅ Clear separation of concerns
- ✅ Good use of middleware pattern

#### 4. Security
- ✅ JWT token verification
- ✅ Rate limiting implemented
- ✅ User data isolation
- ⚠️ Could add input sanitization middleware
- ⚠️ Could add request validation middleware

---

## Conclusion

Ailldoit is a **production-ready, feature-complete MVP** with a solid foundation for scaling. The system successfully delivers on all core requirements:

✅ **Complete Feature Set:** All MVP features implemented and working  
✅ **Scalable Architecture:** Well-structured service layer with clear separation  
✅ **Production Ready:** Environment-aware configuration, secure authentication  
✅ **Comprehensive Services:** 19 backend services covering all use cases  
✅ **Multi-Platform Support:** Social media OAuth and publishing integrated  

### Next Steps Priority Order:

1. **Immediate (Week 1-2):**
   - Cloud storage migration
   - Enhanced error handling
   - Basic test coverage

2. **Short-term (Month 1):**
   - Analytics dashboard
   - Performance monitoring enhancements
   - API documentation

3. **Medium-term (Month 2-3):**
   - Batch operations
   - Content library
   - Advanced caching

4. **Long-term (Quarter 1+):**
   - Background job processing
   - Advanced analytics
   - Microservices consideration

---

---

## Latest Updates (January 2025 Audit)

### New Features Added

#### 1. Prompt Selector Tool
- Comprehensive prompt template library with 10+ categories
- Advanced filtering (shot type, tone, subject, difficulty)
- Guided prompt builder with AI assistance
- Prompt remix and customization features
- Inspiration feed for trending prompts
- 6 new API endpoints for prompt management

#### 2. Linked Prompt Service
- AI-powered semantic matching of campaign briefs to visual prompts
- Custom prompt generation based on brief analysis
- Industry-specific prompt blocks (skincare, food, tech, etc.)
- Platform and audience-aware suggestions

#### 3. Enhanced Video Generation
- Long video generation (15-60 seconds) with video stitching
- Video regeneration endpoint for expired assets
- Migration service for fixing expired videos
- Bulk migration capabilities

#### 4. OAuth Enhancements
- Dual flow support (login vs publishing)
- Facebook data deletion callback (GDPR compliance)
- Enhanced connection management

### Updated Metrics
- **API Endpoints:** 33+ → 40+ endpoints
- **Services:** 19 → 21 backend services
- **Video Generation Credits:** 10 → 15 credits
- **New Components:** PromptSelectorTool, LinkedPromptSuggestions

### Technical Improvements
- Video expiration mitigation with migration service
- Enhanced error handling for AI generation
- Improved OAuth flow security with state parameters
- Better asset management with validation and migration

---

**Document Status:** Complete  
**Last Reviewed:** January 2025 (Latest Audit)  
**Next Review:** March 2025

