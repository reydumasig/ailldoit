## Ailldoit AI Solution Overview

Ailldoit is an **AI-powered social media content generation platform** that converts structured product briefs into high-performing, localized ad campaigns for TikTok, Instagram, Facebook, and YouTube. The system orchestrates multiple AI providers (OpenAI, Gemini, Replicate) with a learning loop that continuously improves prompts based on real campaign performance in Southeast Asia.

### AI Use Cases and Innovation

- **Brief-to-campaign generation**: Turn a product brief into a full campaign (hooks, captions, hashtags, image/video concepts) in 6 languages using multi-provider AI (`ai-service`, `learning-service`, `prompt-selector-service`, `linked-prompt-service`).
- **Multi-modal content creation**: Use Gemini Imagen and Veo for production-ready image and video ads, with long-form video stitching and regeneration, backed by performance-aware prompt optimization.
- **Closed-loop learning system**: Capture content performance (views, CTR, engagement) into PostgreSQL tables (`contentPerformance`, `learningPatterns`, `aiPromptTemplates`) and feed this back into prompt selection and generation for future campaigns.
- **A/B testing at scale**: Automatically generate and track variants for hooks and creatives, then promote high-performing patterns into reusable prompt templates.

### Current Progress and Traction Metrics

- **MVP status**: 100% functional, **production ready** with 33+ API endpoints, 11+ database tables, and 20+ backend services in active use.
- **User readiness**: Real user authentication with Firebase, user-scoped campaigns, and concurrent-user support tested at **100+ simultaneous users** and **50+ concurrent AI generations**.
- **Monetization**: Live-ready Stripe subscription stack with tiered plans (Free, Starter, Growth, Enterprise) and real-time credit tracking across text, image, and video generations.
- **Feature completeness**: End-to-end journey implemented—onboarding → campaign creation → AI generation → A/B optimization → publishing → analytics—validated in `MVP_FEATURE_AUDIT_2025.md` and `SYSTEM_AUDIT_AND_PROCESS_FLOW.md`.

### Strategic Use of Google Cloud

- **Gemini AI integration**: Deep use of Gemini Imagen and Veo for image and video generation, plus Gemini text models for prompt enrichment, long video stitching, and fallback logic documented in `LONG_VIDEO_FEATURE_AUDIT_AND_RECOMMENDATIONS.md`.
- **Cloud Run–ready backend**: The TypeScript/Express API is designed for containerized deployment on **Cloud Run**, with environment-aware configuration (`server/config/environment.ts`), `cloudbuild.yaml`, and deployment scripts for staging and production.
- **Managed data and storage**: PostgreSQL (Neon) is paired with Firebase Storage and Google Cloud–compatible asset storage patterns (`firebase-storage-service`, `storage-service`), enabling future migration to Cloud Storage with minimal code changes.
- **Observability and scaling**: Rate limiting, performance monitoring, and credit tracking services are built to align with Google Cloud’s autoscaling model—so AI-heavy workloads (Gemini calls, video processing) can be safely scaled on Cloud Run while controlling cost and quota.


