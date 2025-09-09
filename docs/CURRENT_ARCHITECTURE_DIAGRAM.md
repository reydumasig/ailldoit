# Ailldoit Platform - Current System Architecture

## Overview
This document provides a comprehensive view of the Ailldoit platform's current architecture as of September 2025, including all implemented components, services, and integrations.

## High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT LAYER                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   React App     │  │     Wouter      │  │  TanStack Query │  │   Tailwind +    │ │
│  │   TypeScript    │  │    Routing      │  │ State Management│  │   shadcn/ui     │ │
│  │     (Vite)      │  │                 │  │                 │  │   Components    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                   HTTPS/WSS
                                        │
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                  SERVER LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   Express.js    │  │  Firebase Auth  │  │    Drizzle      │  │   TypeScript    │ │
│  │   API Server    │  │   JWT Verify    │  │      ORM        │  │   ES Modules    │ │
│  │   (Node.js)     │  │                 │  │                 │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                SERVICE LAYER                                       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  AI Service     │  │ Video Hosting   │  │ Firebase Storage│  │  Credit System  │ │
│  │   Manager       │  │    Service      │  │    Service      │  │   & Monitoring  │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                               AI PROVIDERS LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   OpenAI        │  │   Replicate     │  │     Gemini      │  │     DALL-E 3    │ │
│  │   GPT-4o        │  │     SDXL        │  │   Imagen 3.0    │  │   (Fallback)    │ │
│  │ (Text Gen)      │  │  (Primary Img)  │  │ (Backup Img +   │  │                 │ │
│  │                 │  │                 │  │  Veo 2/3 Video) │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              DATA & STORAGE LAYER                                  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   PostgreSQL    │  │ Firebase Storage│  │  Local Storage  │  │   Session       │ │
│  │   (Neon DB)     │  │  (Videos CDN)   │  │   (Fallback)    │  │    Store        │ │
│  │ Users/Campaigns │  │                 │  │                 │  │   (Database)    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                             EXTERNAL INTEGRATIONS                                  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │      Meta       │  │     TikTok      │  │     YouTube     │  │     Stripe      │ │
│  │ Facebook/Insta  │  │    Ads API      │  │   Data API      │  │   Payments      │ │
│  │     API         │  │                 │  │                 │  │ Subscriptions   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### Frontend Architecture
```
React Application (TypeScript + Vite)
├── Routing: Wouter
├── State Management: TanStack Query
├── UI Components: shadcn/ui + Tailwind CSS
├── Icons: Lucide React + React Icons
├── Forms: React Hook Form + Zod validation
└── Authentication: Firebase Auth SDK
```

### Backend Architecture
```
Express.js Server (Node.js + TypeScript)
├── Authentication: Firebase Admin SDK + JWT
├── Database: Drizzle ORM + PostgreSQL (Neon)
├── Session Management: express-session + connect-pg-simple
├── API Routes: RESTful endpoints
└── Middleware: CORS, body parsing, error handling
```

### AI Content Generation Pipeline

#### Text Generation Flow
```
User Brief → OpenAI GPT-4o → Structured Content
                  ├── Platform-specific captions
                  ├── Hashtags and CTAs
                  ├── A/B test variants
                  └── Localization support
```

#### Image Generation Flow (Hierarchical Fallback)
```
Campaign Brief → Replicate SDXL (Primary)
                      ├── Success → High-quality ad images
                      └── Fail → Gemini Imagen 3.0 (Backup)
                                    ├── Success → Quality images
                                    └── Fail → OpenAI DALL-E 3 (Final Fallback)
```

#### Video Generation Flow
```
Campaign Brief → Gemini Veo 2/3 (8-second videos with audio)
                      ├── Success → Firebase Storage Upload
                      ├── Fallback → Local Storage
                      └── Permanent URLs with no expiration
```

### Data Architecture

#### Core Database Schema
```sql
-- Users Table
users {
  id: varchar (Firebase UID)
  email: varchar
  role: user|admin|superadmin
  subscription: free|starter|growth|enterprise
  credits: integer
  stripe_customer_id: varchar
  created_at: timestamp
}

-- Campaigns Table  
campaigns {
  id: serial
  user_id: varchar (FK)
  name: varchar
  brief: text
  status: draft|generating|ready|published|active
  platform: tiktok|instagram|facebook
  language: en|es|fr|etc
  created_at: timestamp
}

-- Assets Table
assets {
  id: serial
  campaign_id: integer (FK)
  type: text|image|video
  content: text
  url: varchar
  ai_provider: openai|gemini|replicate|dalle
  created_at: timestamp
}

-- Sessions Table (Authentication)
sessions {
  sid: varchar (PK)
  sess: jsonb
  expire: timestamp
}
```

### Storage Architecture

#### Video Hosting Strategy
```
Primary: Firebase Storage
├── Permanent public URLs
├── Global CDN distribution
├── Zero expiration (far-future dates)
└── Scalable for any number of assets

Fallback: Local Storage
├── /videos/ endpoint serving
├── Local file system storage
└── Development/backup option
```

### AI Provider Integration

#### Service Hierarchy & Reliability
```
Text Generation:
└── OpenAI GPT-4o (Primary & Only)

Image Generation:
├── Replicate SDXL (Primary - Most Reliable)
├── Gemini Imagen 3.0 (Secondary Backup)
└── OpenAI DALL-E 3 (Final Fallback - URL Expiration Risk)

Video Generation:
├── Gemini Veo 3 (Primary - 8s with audio)
├── Gemini Veo 2 (Secondary)
└── Local fallback for hosting failures
```

### Authentication & Authorization

#### User Role Hierarchy
```
superadmin (rey@ailldoit.com, test@ailldoit.com, rey@taxikel.com)
├── Full platform access
├── User management
├── System administration
└── All campaign operations

admin (mmdumasig@gmail.com)
├── User management (limited)
├── Content moderation
└── Campaign oversight

user (all other users)
├── Create/manage own campaigns
├── Generate AI content
└── Publish to connected platforms
```

#### Subscription Tiers
```
Free Tier:
├── 100 credits
├── Basic AI generation
└── Limited campaigns

Starter Tier:
├── 1,000 credits/month
├── All AI features
└── Standard support

Growth Tier:
├── 5,000 credits/month
├── Priority generation
└── Advanced analytics

Enterprise Tier:
├── 10,000+ credits
├── Custom features
├── Premium support
└── API access
```

### External API Integrations

#### Social Media Publishing
```
Meta (Facebook/Instagram):
├── OAuth 2.0 authentication
├── Graph API integration
├── Content publishing
└── Campaign management

TikTok:
├── TikTok Business API
├── Content upload
└── Campaign metrics

YouTube:
├── YouTube Data API v3
├── Video uploads
└── Channel management
```

#### Payment Processing
```
Stripe Integration:
├── Subscription management
├── Credit top-ups
├── Invoice generation
├── Webhook handling
└── Environment-aware keys (test/live)
```

### Deployment & Infrastructure

#### Current Hosting
```
Platform: Replit Deployments
├── Automatic HTTPS/TLS
├── Environment detection
├── Workflow-based deployment
└── Built-in PostgreSQL database
```

#### Environment Configuration
```
Development:
├── Local workflow execution
├── Test Stripe keys
├── Development database
└── Local file serving

Production:
├── Replit Deployments
├── Live Stripe keys
├── Production database
└── Firebase Storage CDN
```

### Security & Performance

#### Security Measures
```
Authentication:
├── Firebase JWT token verification
├── Session-based authentication
├── HTTPS-only connections
└── Environment variable secrets

API Security:
├── Rate limiting via credits
├── User-specific data isolation
├── Input validation with Zod
└── SQL injection prevention (Drizzle ORM)
```

#### Performance Optimizations
```
Frontend:
├── Code splitting with Vite
├── Component-level loading states
├── TanStack Query caching
└── Optimistic UI updates

Backend:
├── Connection pooling (PostgreSQL)
├── Efficient database queries
├── CDN for media assets (Firebase)
└── Credit-based rate limiting
```

### Monitoring & Analytics

#### System Monitoring
```
Performance Monitor:
├── Real-time system load tracking
├── Concurrent user monitoring
├── AI API call tracking
└── Credit usage analytics

Error Tracking:
├── Comprehensive error logging
├── AI generation failure tracking
├── Video hosting audit system
└── Database connectivity monitoring
```

## Key Architectural Decisions

### 1. AI Provider Hierarchy (August 2025)
- **Decision**: Implemented Replicate SDXL as primary image generator
- **Rationale**: Most reliable, consistent quality for advertising content
- **Fallbacks**: Gemini Imagen 3.0 → OpenAI DALL-E 3

### 2. Video Storage Migration (August 2025)  
- **Decision**: Firebase Storage as primary video hosting
- **Rationale**: Eliminates expiration issues, provides CDN, scales infinitely
- **Fallback**: Local storage for development/backup

### 3. Database Choice
- **Decision**: PostgreSQL with Drizzle ORM
- **Rationale**: ACID compliance, complex queries, mature ecosystem
- **Benefits**: Type safety, migration management, performance

### 4. Authentication Strategy
- **Decision**: Firebase Auth with custom backend verification
- **Rationale**: Proven scalability, social login support, security
- **Implementation**: JWT verification with session management

### 5. Frontend Architecture
- **Decision**: React + TypeScript with Wouter routing
- **Rationale**: Component reusability, type safety, modern tooling
- **Benefits**: Developer experience, maintainability, performance

## Future Considerations

### Scaling Roadmap
1. **Database Optimization**: Read replicas, query optimization
2. **CDN Enhancement**: Global media distribution
3. **API Rate Limiting**: More sophisticated throttling
4. **Caching Layer**: Redis for session/query caching
5. **Microservices**: Break out AI generation into separate services

### Technology Evolution
1. **AI Model Updates**: Stay current with latest GPT/Gemini versions
2. **Video Generation**: Explore additional providers (RunwayML, Pika)
3. **Real-time Features**: WebSocket for live generation updates
4. **Mobile Apps**: React Native for mobile platforms

---

*Last Updated: September 9, 2025*  
*Version: Production v1.0*