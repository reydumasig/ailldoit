# Ailldoit - AI-Powered Social Media Ad Generator

## Overview
Ailldoit is a web application designed to generate viral, localized social media ad content using AI. It enables users to submit product briefs and automatically receive platform-specific ad content, including captions, hashtags, and video scripts, in multiple languages. The platform supports ad generation for TikTok, Instagram, and Facebook, incorporating A/B testing capabilities. Ailldoit aims to streamline content creation for social media marketing, offering AI-powered tools for generating creative prompts and ensuring content aligns with campaign objectives.

## Recent Changes (August 2025)
### AI Content Generation Audit & Optimization (August 6, 2025)
- **Provider Hierarchy Updated**: Changed image generation to use Replicate SDXL as primary provider
- **Configuration Optimized**: Text (OpenAI GPT-4o) → Images (Replicate SDXL) → Videos (Gemini Veo 2/3)
- **Fallback System Enhanced**: Each provider has robust backup options for reliability
- **Performance Improved**: Replicate SDXL provides consistent, high-quality advertising images
- **Audio Integration**: Gemini Veo delivers 8-second videos with background music and sound effects
- **Local Storage**: Videos stored locally to prevent expiration issues

## Recent Changes (August 2025)
### System-Wide Video Storage Audit & Fix (August 5, 2025)
- **Comprehensive Audit Completed**: Checked all video assets across entire platform
- **Issues Found**:
  - 3 assets using external Gemini URLs (will expire): mmdumasig@gmail.com, test@ailldoit.com
  - 6 assets pointing to missing local video files across multiple users
  - 1 asset with incorrect path prefix (missing /videos/)
- **Actions Taken**:
  - Fixed path prefix issue for Isla Botanica campaign
  - Reset 8 campaigns to draft status for fresh video generation
  - Removed 9 broken asset records (3 external URLs + 6 missing files)
  - Added system-wide audit tools (`auditAllVideoAssets`, `/api/admin/audit-videos`)
- **Users Affected**: 
  - rey@taxikel.com: 5 campaigns reset (ZenMist, Likhâ Lokal, FitFuel, HaloActive, Isla Botanica)
  - test@ailldoit.com: 2 campaigns reset (Taxikel Delivery campaigns)
  - mmdumasig@gmail.com: 1 campaign reset (EUI Launch)
- **Current Status**: 6 working video assets with 9 physical files on disk, all broken assets cleaned up
- **Additional Fix**: Found and removed 1 missed external Gemini URL for campaign 15 (HaloActive Smart Water Bottle)
- **Result**: Completely clean video storage system with reliable local file serving, zero "Video Expired" errors

### Campaign Management Enhancement (August 5, 2025)
- **New Feature**: Implemented complete campaign deletion functionality
- **User Interface**: Added delete button (trash icon) to campaign cards with confirmation dialog
- **Safety Features**: Confirmation dialog warns users about permanent data removal and cannot be undone
- **Backend Implementation**: Secure delete endpoint that only allows users to delete their own campaigns
- **UI/UX**: Red-themed delete button with hover states, loading states during deletion
- **Data Integrity**: Automatic cache invalidation to refresh dashboard stats and campaign lists after deletion
- **Result**: Users can now safely remove unwanted campaigns or mistakes from their dashboard

### AI Generation System Fix (August 5, 2025)
- **Issue Identified**: Gemini Imagen API still restricted despite paid billing account
- **Root Cause**: Imagen API has separate billing requirements from other Gemini services
- **Solution Implemented**: Switched to OpenAI DALL-E 3 as primary image generator with Replicate/Gemini fallbacks
- **System Updates**: 
  - Added comprehensive error logging for Gemini API responses
  - Implemented OpenAI DALL-E 3 as primary with Replicate/Gemini fallbacks when needed
  - Enhanced response structure handling for multiple API formats
  - Video generation working successfully with 8-second duration and audio (Gemini Veo/Replicate)
- **Current Status**: Video generation ✅ working (8s with audio), Image generation ✅ fixed with OpenAI DALL-E 3
- **Result**: Full AI content generation pipeline operational with robust fallback mechanisms

### Production Deployment & OAuth Configuration (August 4, 2025)
- **Milestone**: Successfully deployed Ailldoit MVP to production using Replit Deployments
- **OAuth Integration**: Implemented Meta (Facebook) OAuth authentication flow with proper HTTPS redirect URIs
- **Issue Fixed**: Updated Facebook API scopes from deprecated business permissions to basic public scopes (`email,public_profile`)
- **Environment Configuration**: Production environment automatically detects and uses HTTPS, production Stripe keys, and secure redirect URIs
- **Production Features**: Live platform with AI campaign generation, user authentication, subscription management, and social media connections

### Bug Fix: Campaign Navigation Flow (August 1, 2025)
- **Issue Resolved**: Fixed "Campaign not found" error that occurred when selecting visual prompts in campaign creation
- **Root Cause**: Navigation was attempting to access invalid campaign IDs (`undefined`) causing database parsing errors
- **Solution Implemented**: 
  - Enhanced campaign creation response handling with proper ID validation
  - Added robust error checking in AI Generator page for invalid campaign IDs
  - Implemented server-side parameter validation to prevent "NaN" database errors
  - Improved form submission flow to ensure visual prompt selection only updates form fields
- **Result**: Clean navigation flow where visual prompt selection stays on form, and navigation only occurs on "Create Campaign" button click

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript
- **Routing**: Wouter
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: TanStack Query
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Firebase Auth with JWT token verification
- **Project Structure**: Monorepo with `client/`, `server/`, and `shared/` directories.

### Key Features and Design Patterns
- **Database Layer**: Drizzle ORM for PostgreSQL schema management, including campaigns, users, and assets.
- **AI Content Generation**: Integration with OpenAI GPT-4 Turbo for text, Gemini Imagen 3.0 for images, and Gemini Veo 3 for video generation. Includes A/B testing for content variants and localization for platform and language-specific content.
- **Campaign Management**: Supports various campaign states (draft, generating, ready, published, active) and content types (video/image ads).
- **User Interface**: Features a dashboard for campaign overview, a form-based campaign creation process, AI content preview, and publishing configurations.
- **Prompt Selector Tool System**: Dual prompt generation system including an AI Brief Template System for business content and an Advanced Prompt Selector Tool for creative visual content. The Prompt Selector offers categories/filters, an inspiration feed with remix capabilities, a guided prompt builder, and a "Feeling Lucky" random generator.
- **Linked Template + Prompt System**: AI analyzes campaign briefs to semantically match and suggest optimal visual prompts from a database of templates, or generates custom prompts when exact matches are unavailable.
- **Local Video Storage**: Videos generated by AI services are stored locally to prevent URL expiration, served via a dedicated `/videos/` endpoint.
- **Performance & Scaling**: Includes a Credit Tracking Service for AI API calls, a Performance Monitor for real-time system load, and capacity assessment for up to 100 concurrent users. Implements credit-based rate limiting and provides scaling recommendations.
- **Deployment**: Environment-aware configuration with separate settings for development and production (e.g., Stripe keys, domain detection).

## External Dependencies

### UI Components
- **shadcn/ui**: UI component library built with Radix UI primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **Lucide React**: Icon library.
- **React Icons**: Additional social media icons.

### Data & Forms
- **React Hook Form**: Form state management with Zod validation.
- **TanStack Query**: Server state management and caching.
- **Zod**: Schema validation for type safety.

### AI Services
- **OpenAI GPT-4 Turbo**: Text generation.
- **Gemini Imagen 3.0**: Image generation.
- **Gemini Veo 3**: Video generation.

### Database & Authentication
- **PostgreSQL**: Primary database.
- **Drizzle ORM**: ORM for PostgreSQL.
- **Neon Database (@neondatabase/serverless)**: PostgreSQL provider.
- **Firebase Auth**: User authentication system.
- **Firebase Admin SDK**: Server-side authentication management.

### Storage & APIs
- **Meta (Facebook/Instagram) API**: For social media publishing.
- **TikTok API**: For social media publishing.
- **YouTube API**: For social media publishing.
- **Stripe**: Subscription and payment processing.

### Development Tools
- **Vite**: Frontend build tool.
- **ESBuild**: Backend bundling.
- **TypeScript**: Language for type safety.