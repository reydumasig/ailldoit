# Ailldoit MediaOps — MVP Plan (Real-Estate AI Photo Module)

**Status:** Active execution — started 2026-04-19
**Product owner:** Rey (CEO) — see `PRD.md` for full Founder-Grade PRD
**Engineering owner:** Claude
**Target:** Paying-customer MVP launch — end of Month 2 (~8 weeks)
**Last session:** 2026-04-19 — finished Week 1 → Week 4 end-to-end (infra side of Week 3). See [§8 Updates log](#8-updates-log).

> ## 🎯 Where we left off (2026-04-19)
>
> Weeks 1, 2, and 4 are code-complete. Week 3's `PhotoModelProvider` abstraction
> and the `enhance` consumer handler are in place; the remaining Week 3 items
> (white balance, perspective, sky replace, window pull) are each a new handler
> plugged into the same provider interface.
>
> **Next open task on the critical path:** white balance — ship gray-world as the
> CPU default (uses the abstraction), then start the model bakeoff to pin a
> Replicate version for the ML path.
>
> **Quality gates green:** `npm run check` clean. HDR → enhance chain works
> end-to-end locally (enhance falls back to Sharp tone curve when
> `REPLICATE_API_TOKEN` is unset).
>
> **Dev ops reminder:** Cloud Run staging service is provisioned but **off**;
> Cloud SQL stays off between sessions; local Docker Postgres is the dev DB.

> "The operating system for real estate media production." Not an AI editor.
> Not a filter app. A workflow+cost+speed platform — *Zapier + Canva +
> Lightroom for real estate media.*

---

## 1. Product phases (from PRD)

Aligned with the PRD's three-phase rollout. This plan elaborates the MVP build
and schedules Phase 1.5 retention work; Phase 2 (monetisation+moat) is tracked
but not estimated here.

### Phase 1 — MVP (Month 1–2, launch)
- Auth + **Organizations** + roles (Admin / Editor-QC / Viewer)
- Project & upload system (drag-drop, folder, bracket auto-detect)
- Processing pipeline:
  - Ingestion (EXIF normalise, metadata extract)
  - Bracket grouping
  - HDR merge, white balance, exposure balance, perspective, crop
  - Enhancement (brightness, contrast, vibrance, **noise reduction**)
  - Smart edits: **sky replacement**, **window pull** (highlight recovery)
- Preview (before/after slider, watermark, thumbnail grid)
- Billing — credits wallet, pay-on-download, free preview
- Download (single + batch ZIP)

### Phase 1.5 — Retention (Month 3)
- Team workflow: invite users by email, role assignment, QC approval before download
- Style profiles — save per-account editing preferences
- Basic integrations: Dropbox ingest, manual export

### Phase 2 — Monetisation + Moat (post-Month 3)
- Object removal (inpainting), declutter mode
- Virtual twilight, TV/fireplace fill, sky toggle
- Virtual staging (room detection, furniture placement, style presets)
- Automation engine (auto-process on upload, auto-deliver, webhooks)
- API access (upload, status, download)
- Integrations (Google Drive, Aryeo, HDPhotoHub, Zapier/Make/n8n)

---

## 2. Technical decisions (committed)

Tech stack stays native to existing ailldoit. I'm deliberately NOT migrating
to the Next.js / NestJS / Python / FastAPI stack from the PRD's Section 5 —
that architecture is where we end up in 12 months, not where we start. MVP
reuses what works.

| Area | Decision | Why |
|---|---|---|
| Repo | Extend existing ailldoit monorepo | Reuses auth, billing, storage, DB, CI. |
| Frontend | Vite + React + wouter | Add `/photos/*` routes. Share auth + shell with existing app. NO migration to Next.js for MVP. |
| Backend | Express + Drizzle + Postgres | New services under `server/services/photo-*`. NO migration to NestJS for MVP. |
| Multi-tenancy | **Organizations table + org_members join table** | Phase 1 per PRD. Auto-create a personal org for every user on first photo-module access so existing users aren't blocked. |
| Image processing | Node-only for MVP; call external AI providers for heavy work | Defers Python microservice complexity. Python+GPU worker tier becomes Phase 2 when volume + margin justify it. |
| AI provider | Replicate (primary), behind a pluggable `PhotoModelProvider` abstraction | Broad model catalog, pay-per-second, easy to swap hot paths to Modal or self-host later. |
| Exposure fusion (HDR) | Mertens fusion via `@techstark/opencv-js` in Node for MVP | No Python dependency. Works on JPEG brackets. RAW + Debevec becomes Phase 2. |
| Queue | Redis + BullMQ | Edit jobs are async (30s–2min). Non-negotiable. |
| Storage | Firebase Storage (existing) | Already wired. Revisit for egress economics at real volume. |
| DB | Extend existing Drizzle schema | Additive tables. No migration of existing data. |
| Billing | Stripe (extend existing subscription-service) | New photo-credit SKU, photo-credit ledger scoped to org. |
| Auth | Firebase Auth (existing) | No change. |
| Observability | Sentry + PostHog (to wire in Month 2) | Cost-per-job telemetry MUST be live before launch. |
| Deploy | Existing Cloud Run + Cloud Build pipeline | Reuses deploy infra fixed in earlier blocker work. |

---

## 3. Execution plan — 90-day roadmap

### Month 1 (Weeks 1–4) — Upload + processing pipeline + preview

**Week 1 — Foundation** ✅ _complete 2026-04-19_
- [x] Schema: `organizations`, `organization_members`, `photo_projects` (org-scoped), `photo_assets`, `bracket_groups`, `edit_jobs`, `edit_versions`, `photo_downloads`, `photo_style_profiles`, `photo_credit_ledger`
- [x] Client `/photos` landing route wired into router + sidebar
- [x] Run `npm run db:push` to materialise new tables in Postgres
- [x] Auto-create-personal-org helper on first photo-module access _(`organizationService.resolveActiveOrgId` — provisions a personal org on first `/api/photo/*` hit)_
- [x] Server endpoints: `POST /api/photo/projects`, `GET /api/photo/projects`, `GET /api/photo/projects/:id`
- [x] Upload endpoint: `POST /api/photo/projects/:id/assets` (multi-file JPEG → Firebase Storage) _(multer memory storage → Firebase Storage, 25MB × 40 files/request)_
- [x] EXIF extraction (capture time, exposure, ISO, f-number, focal length, camera model) _(exifr in `photo-asset-service`; includes `exposureBiasEv` for bracket detection)_
- [x] Project list + project detail pages in client _(`/photos` + `/photos/:id` with drag-drop upload, thumbnail grid, EXIF chips)_

**Week 2 — Bracket detection + core pipeline scaffold** ✅ _complete 2026-04-19_
- [x] Bracket auto-grouping heuristic (timestamp + exposure delta) _(`bracket-detection-service` — 2.5s time-window clustering, idempotent rebuild in a transaction)_
- [x] Redis + BullMQ wired in the server (dev and prod config) _(Upstash via `REDIS_URL`, `maxRetriesPerRequest:null`, `enableReadyCheck:false` for BullMQ compat; TLS auto-detected from `rediss:`)_
- [x] Worker scaffold: claim job → run operation → write output + emit metrics _(in-process `startPhotoWorker` with SIGTERM-safe graceful shutdown; single DB row per user click, `editJobService` owns status transitions)_
- [x] Exposure fusion (Mertens) for bracketed sets _(simplified single-scale weighted average; rec. 709 luminance weights, 1920px preview; ~200ms for 5 exposures)_
- [ ] Single-image path (no bracket) falls through to enhancement only _(pipeline_auto no-ops today; wire this when the first single-image user surfaces)_
- [x] Watermarked preview image generated for every successful job _("AILLDOIT PREVIEW" diagonal SVG, white 0.28 opacity + black stroke — composited via Sharp)_

**Week 3 — Core corrections + smart edits** 🟡 _infra complete 2026-04-19; model-specific handlers pending_
- [ ] White balance pass (gray-world or ML via Replicate) _(CPU gray-world is the fast follow-up — uses the abstraction already in place)_
- [x] Exposure balancing + brightness/contrast/vibrance/noise reduction _(`enhance` handler — local Sharp tone curve fallback + provider path; chained after `hdr_merge` in `pipeline_auto`, best-effort — failure leaves the HDR version intact)_
- [ ] Perspective / vertical correction _(likely stays local OpenCV — mark for after white balance)_
- [x] `PhotoModelProvider` abstraction with Replicate as default impl _(`server/services/photo-providers/*` — `types.ts`, `replicate-provider.ts`, `local-provider.ts`, factory via `getPhotoModelProvider()`. Auto-selects Replicate when `REPLICATE_API_TOKEN` is set, local stub otherwise. `MODEL_REGISTRY` entries deliberately `null` until per-model bakeoff is done — safer than drift)_
- [ ] Sky replacement (Replicate: segmentation + composite) _(blocked on model bakeoff + pin)_
- [ ] Window pull (highlight recovery on merged HDR output) _(blocked on model bakeoff + pin)_

**Week 4 — Preview UI + review flow** ✅ _complete 2026-04-19 (code side)_
- [x] Thumbnail grid view per project _(shipped in Week 1 — singles section below bracket cards)_
- [x] Before/after slider component _(pointer-capture drag, clip-path overlay; "before" = median-EV source frame, "after" = current rendition; mobile + desktop)_
- [x] Edit version history per asset _(`GET /api/photo/projects/:id/assets/:assetId/versions` → `edit_versions` joined with `edit_jobs`; chip strip in `BracketGroupCard` swaps the "after" side of the slider on click)_
- [x] Download watermarked preview (free, no billing) _(blob fetch → object URL so the file lands with the proper filename, not Firebase's hash)_
- [ ] Internal beta: one photographer shoots a property, runs the whole pipeline _(field test — not dev work; schedule after white balance lands)_

### Month 2 (Weeks 5–8) — Billing + download + MVP launch

**Week 5 — Credit wallet + Stripe wiring**
- [ ] New Stripe price SKUs (credit pack tiers)
- [ ] Photo-credit ledger writes on grant, purchase, debit, refund
- [ ] Org-level balance display
- [ ] Checkout flow: Stripe Checkout → webhook → ledger credit

**Week 6 — Pay-on-download + delivery**
- [ ] Unlock-download endpoint (debits credits, returns non-watermarked URL)
- [ ] Individual image download
- [ ] Batch download (ZIP)
- [ ] "Mark project delivered" flag
- [ ] Project history/archive filters

**Week 7 — Polish + telemetry**
- [ ] Sentry wiring on all worker paths
- [ ] PostHog events (upload_started, job_succeeded/failed, preview_viewed, download_unlocked)
- [ ] Cost-per-job dashboard (admin-only)
- [ ] Failure-recovery UX (retry, contact support)
- [ ] Free-preview limits (watermarked outputs unlimited, downloads metered)

**Week 8 — Launch prep**
- [ ] Marketing page copy + screenshots (positioning per PRD §1: MediaOps, not editor)
- [ ] Billing edge cases (failed charges, refunds, credit rollover)
- [ ] Production smoke tests across all pipeline stages
- [ ] Onboarding flow for first-time photographers
- [ ] **Go live to paying customers**

### Month 3 (Weeks 9–12) — Retention layer (Phase 1.5)

**Weeks 9–10 — Team workflow**
- [ ] Invite users by email (tokenised link)
- [ ] Role assignment UI (admin/editor/viewer)
- [ ] QC approval step: editor reviews → approves → only then download unlocks

**Week 11 — Style profiles**
- [ ] Saved per-account editing preferences (brightness, warmth, contrast, sky preset)
- [ ] Apply profile globally or per-project

**Week 12 — Dropbox ingest**
- [ ] Dropbox OAuth + folder-watch ingest
- [ ] Manual export endpoint

---

## 4. Data model (from PRD §8, with extensions)

Core tables live in `shared/schema.ts`:

- `users` (existing — unchanged)
- `organizations` — id, name, slug, created_by, created_at, updated_at
- `organization_members` — id, org_id, user_id, role ('admin'|'editor'|'viewer'), joined_at
- `photo_projects` — id, org_id, created_by_user_id, name, address_line, status, settings
- `bracket_groups` — id, project_id, capture_time_center, photo_count, status, merged_asset_id
- `photo_assets` — id, project_id, user_id, source_url, file_name, mime, size, dimensions, exif, bracket_group_id, derived_from_job_id, is_cover
- `edit_jobs` — id, project_id, user_id, asset_id, bracket_group_id, job_type, status, provider, provider_job_id, input_params, output_asset_id, cost_cents, duration_ms, error_message, timestamps
- `edit_versions` — id, asset_id, job_id, version_number, output_url, watermarked, is_current
- `photo_downloads` — id, project_id, user_id, version_id, credits_charged, stripe_payment_intent_id, downloaded_at
- `photo_style_profiles` — id, user_id, name, is_default, settings (Phase 1.5 UI, data model present from Day 1)
- `photo_credit_ledger` — id, org_id, delta, balance_after, reason, ref_type, ref_id, stripe_charge_id

---

## 5. Monetisation (per PRD §10 — MVP starts on Option A)

- **MVP pricing:** Pay-per-image via credits. Free unlimited watermarked
  previews, credits debited only on download.
- Credit pack tiers (to finalise with Rey before Week 5): starter / growth /
  agency. Price benchmarks ~$0.45–$0.60 per image based on AutoHDR pricing
  scan (500 for $265, 5000 for $2250).
- North star metric: **cost per processed image vs revenue per image**.
  Telemetry for this is live by Week 7.
- Option B (subscription+usage) and Option C (enterprise/API billing) stay on
  the roadmap; revisit once we have 10+ paying customers.

---

## 6. Success metrics (PRD §11)

**Product:** upload→download conversion rate, time to first processed image,
processing success rate
**Business:** revenue per user, cost per image, credit burn rate
**Retention:** projects per user per week, repeat usage, team seat expansion

---

## 7. Risks + mitigations (PRD §13)

- **AI output quality** → fallback presets + manual tweak controls + QC
  workflow in Phase 1.5
- **GPU cost explosion** → hybrid CV+AI (CV for deterministic ops, generative
  only for sky/object/staging), batch processing, cost-per-job telemetry live
  before launch
- **Commoditisation** → workflow lock-in (projects, history), integrations
  (Phase 1.5 Dropbox, Phase 2 Drive/Aryeo), team features

---

## 8. Updates log

- **2026-04-19** — Plan created. Rey confirmed Option #3 (photo module inside
  ailldoit, ad-generator stays).
- **2026-04-19** — Revised to match full Founder-Grade PRD: orgs/roles moved
  into MVP Phase 1, object removal moved to Phase 2, style profiles moved to
  Phase 1.5, timeline extended to 90 days, positioning updated to "MediaOps /
  media operating system." Tech stack call (stay on Vite+Express+Node)
  documented with rationale.
- **2026-04-19 — Week 1 shipped.** Schema pushed to Postgres. Personal-org
  auto-provisioning wired. Photo project CRUD + multi-file upload + EXIF
  extraction via `exifr`. `/photos` + `/photos/:id` client pages with drag-drop
  dropzone, thumbnail grid, EXIF chips. Firebase Storage hosting source JPEGs
  under `photo/{orgId}/{projectId}/…`.
- **2026-04-19 — Week 2 shipped.** Bracket detection (2.5s time-window
  clustering, idempotent rebuild). BullMQ on Upstash Redis with connection
  factory handling BullMQ-specific options (`maxRetriesPerRequest:null`,
  `enableReadyCheck:false`, TLS from `rediss:`). In-process worker with
  SIGTERM-safe graceful shutdown. Simplified Mertens HDR fusion handler
  (~200ms for 5 exposures, 1920px preview, watermark SVG composite).
  Groups + merged assets + editVersions persisted atomically.
- **2026-04-19 — Week 3 infra + Week 4 shipped.** Built `PhotoModelProvider`
  abstraction (`server/services/photo-providers/*`) with Replicate + local
  fallback providers, selected by env. Added `enhance` consumer handler with a
  Sharp tone-curve CPU fallback so the pipeline works without tokens.
  `pipeline_auto` now chains `hdr_merge → enhance` (enhance failure is
  non-fatal — HDR output survives). Week 4 UI: before/after compare slider
  (pointer-capture drag + clip-path overlay, "before" = median-EV source, "after"
  = current rendition), `GET /projects/:id/assets/:assetId/versions` endpoint,
  version chip strip, download-with-filename button. **Open on critical path:**
  white balance, perspective, sky replace, window pull (each a new handler on
  the provider interface), then Week 5–6 Stripe SKUs.
