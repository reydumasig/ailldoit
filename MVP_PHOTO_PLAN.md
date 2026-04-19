# Ailldoit MediaOps — MVP Plan (Real-Estate AI Photo Module)

**Status:** Active execution — started 2026-04-19
**Product owner:** Rey (CEO) — see `PRD.md` for full Founder-Grade PRD
**Engineering owner:** Claude
**Target:** Paying-customer MVP launch — end of Month 2 (~8 weeks)
**Last session:** 2026-04-19 — Weeks 1 → 6 core code-complete. Week 6 landed pay-on-download (unlock endpoint + per-version + batch ZIP UI, dual-output pipeline). Deferred to Week 7: "mark delivered" flag + archive filters. See [§8 Updates log](#8-updates-log).

> ## 🎯 Where we left off (2026-04-19)
>
> Weeks 1 → 6 core shipped. Pay-on-download is fully wired:
> `photoDownloadService` (unlock / planBatch / unlockBatch) with
> idempotent per-org-per-version receipts in `photo_downloads`; dual-
> output pipeline so every handler emits clean + watermarked JPEGs in
> parallel; endpoints for per-version unlock, batch planning/debit, and
> streamed ZIP via `archiver`; UI for per-version unlock+download, free
> watermarked preview download, and project-wide "Download all clean"
> with a plan/confirm dialog. Partial fulfilment on insufficient credits
> (unlock what you can afford, prompt to top up for the rest).
>
> **Next open tasks on the critical path:**
> 1. **Claude — Week 7 polish:** Sentry on worker paths, PostHog events
>    (upload_started, job_succeeded/failed, preview_viewed,
>    download_unlocked), admin cost-per-job dashboard, failure-recovery
>    UX, "mark project delivered" flag + archive filters (deferred
>    from Week 6).
> 2. **Bakeoff (background) — pin Replicate models** for `sky-replace`,
>    `window-pull`, `perspective`, `white-balance`. Handlers are wired;
>    `MODEL_REGISTRY` entries just need version ids. No handler changes.
> 3. **Rey — Stripe dashboard (done):** the 3 one-time products are created
>    and `VITE_STRIPE_PHOTO_{STARTER,GROWTH,AGENCY}_PACK_PRICE_ID` are set.
>
> **Quality gates green:** `npx tsc --noEmit` clean. Client build clean.
> Credit ledger debit is transactional (SELECT FOR UPDATE). Unlock +
> `photo_downloads` insert is transactional. Webhook idempotency keyed
> on stripe_charge_id; unlock idempotency keyed on (project_id, version_id).
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

**Week 3 — Core corrections + smart edits** ✅ _complete 2026-04-19 (sky-replace + window-pull stubbed, activate when models pinned)_
- [x] White balance pass (gray-world or ML via Replicate) _(`white-balance` handler — provider path first, gray-world CPU fallback on `ProviderUnavailableError`. Per-channel gain clamped to `[0.5, 2.0]` so a neutral photo can't get tinted)_
- [x] Exposure balancing + brightness/contrast/vibrance/noise reduction _(`enhance` handler — local Sharp tone curve fallback + provider path; chained after `hdr_merge` in `pipeline_auto`, best-effort — failure leaves the HDR version intact)_
- [x] Perspective / vertical correction _(`perspective` handler — provider path first, Sharp affine transform fallback (rotation + shear matrix) with params from `job.inputParams`. Clamped to ±15° rotation, ±0.3 shear. Auto ML keystone detection deferred to Phase 1.5)_
- [x] `PhotoModelProvider` abstraction with Replicate as default impl _(`server/services/photo-providers/*` — `types.ts`, `replicate-provider.ts`, `local-provider.ts`, factory via `getPhotoModelProvider()`. Auto-selects Replicate when `REPLICATE_API_TOKEN` is set, local stub otherwise. `MODEL_REGISTRY` entries deliberately `null` until per-model bakeoff is done — safer than drift)_
- [x] Sky replacement (Replicate: segmentation + composite) _(`sky-replace` handler — provider-only, no CPU fallback (pixel-space sky detection regresses quality on tree lines/reflections). Accepts `sky_preset` + `strength` params. Auto-activates when `MODEL_REGISTRY["sky-replace"]` is pinned — zero code change)_
- [x] Window pull (highlight recovery on merged HDR output) _(`window-pull` handler — provider-only, same reasoning as sky-replace. Accepts `target_ev` param. Fails hard if provider unavailable so `pipeline_auto` records the step-failure without touching the prior rendition)_
- [x] `pipeline_auto` orchestrator — chains `hdr_merge → white_balance → perspective → window_pull → sky_replace → enhance`, each post-HDR step best-effort. Provider unavailability on sky/window becomes a soft no-op for the whole run, not a pipeline failure.

**Week 4 — Preview UI + review flow** ✅ _complete 2026-04-19 (code side)_
- [x] Thumbnail grid view per project _(shipped in Week 1 — singles section below bracket cards)_
- [x] Before/after slider component _(pointer-capture drag, clip-path overlay; "before" = median-EV source frame, "after" = current rendition; mobile + desktop)_
- [x] Edit version history per asset _(`GET /api/photo/projects/:id/assets/:assetId/versions` → `edit_versions` joined with `edit_jobs`; chip strip in `BracketGroupCard` swaps the "after" side of the slider on click)_
- [x] Download watermarked preview (free, no billing) _(blob fetch → object URL so the file lands with the proper filename, not Firebase's hash)_
- [ ] Internal beta: one photographer shoots a property, runs the whole pipeline _(field test — not dev work; schedule after white balance lands)_

### Month 2 (Weeks 5–8) — Billing + download + MVP launch

**Week 5 — Credit wallet + Stripe wiring** 🟡 _code-complete 2026-04-19; Stripe dashboard SKUs pending_
- [x] New Stripe price SKUs (credit pack tiers) _(env scaffolding: `VITE_STRIPE_PHOTO_{STARTER,GROWTH,AGENCY}_PACK_PRICE_ID` + LIVE variants; packs with empty priceId are filtered out of the UI so no broken "buy" buttons). **Action for Rey:** create the 3 one-time products in Stripe dashboard and fill the envs)_
- [x] Photo-credit ledger writes on grant, purchase, debit, refund _(`photoCreditService` — append-only rows, `balanceAfter` cached for O(1) reads; debit uses `SELECT ... FOR UPDATE` inside a transaction to prevent concurrent overdraft)_
- [x] Org-level balance display _(`GET /api/photo/credits/balance` + `CreditsChip` in both `/photos` and `/photos/:id` headers; low/zero balance tinted amber/red as a top-up nudge)_
- [x] Checkout flow: Stripe Checkout → webhook → ledger credit _(one-time `mode:payment` Checkout session with orgId/userId/packId metadata; webhook delegates via `subscription-service.handleWebhook` → `photoCreditService.handleWebhookEvent`; idempotent on `stripe_charge_id` so Stripe retries don't double-grant; priceId verified against catalog before grant so tampered metadata can't inflate credits)_

**Week 6 — Pay-on-download + delivery** 🟢 _core code-complete 2026-04-19 (unlock + per-version + batch ZIP + UI). "Mark delivered" flag + archive filters deferred to Week 7 polish._
- [x] Unlock-download endpoint (debits credits, returns non-watermarked URL) _(`POST /api/photo/projects/:id/versions/:versionId/unlock` — idempotent per org+version, `InsufficientCreditsError` → 402, `VersionNotFoundError` → 404, `NoCleanRenditionError` → 409; `photoDownloadService` owns ledger debit + `photo_downloads` receipt inside one DB transaction)_
- [x] Individual image download _(`UnlockAndDownloadButton` in `MergedPreview` — fetches clean URL after unlock, blob-downloads with `{filename}-clean.jpg`; `PreviewDownloadButton` keeps the free watermarked path alive)_
- [x] Batch download (ZIP) _(`POST /versions/batch-unlock` with `planOnly` for the confirm dialog + `GET /versions/download.zip?versionIds=…` streaming via `archiver`; UI: `BatchUnlockButton` in project header pulls currents from cached per-asset version queries, shows `{chargeable, alreadyUnlocked, missingClean}` + balance, partial-fulfilment on 402)_
- [x] Dual-output pipeline _(every handler now emits `clean` + `watermarked` JPEGs in parallel from the same source buffer — `renderDualOutput` / `cleanFromRaw` + `watermarkFromRaw` — and stores both URLs on `editVersions.{outputUrl,cleanOutputUrl}`; zero AI re-run at unlock time)_
- [ ] "Mark project delivered" flag _(deferred to Week 7 — needs retention/archive UI)_
- [ ] Project history/archive filters _(deferred to Week 7)_

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
- **2026-04-19 — Week 5 code-complete.** Photo-credit wallet shipped end to
  end: `photo-credit-service` with append-only ledger, transactional debit
  (SELECT FOR UPDATE prevents concurrent overdraft), idempotent purchase
  grants (keyed on `stripe_charge_id`), Stripe Checkout session creation
  (mode=payment, not subscription — deliberately separate from the
  ad-generator's recurring SKUs). Webhook delegates via
  `subscription-service.handleWebhook` (photo service inspects
  `metadata.source=photo_credit_pack` and either claims the event or
  returns false so subscription logic runs). Route endpoints: `GET
  /credits/packs`, `GET /credits/balance`, `GET /credits/ledger`, `POST
  /credits/checkout`. Client: `CreditsChip` component in both `/photos` and
  `/photos/:id` headers (amber tint <10, red tint at 0), `BuyCreditsModal`
  with pack picker → Stripe redirect, post-redirect balance invalidation at
  1.5s + 5s to catch slow webhooks. **Open on critical path:** Rey creates
  the 3 one-time-price products in Stripe dashboard and sets the env vars;
  then Week 6 unlock-download endpoint + ZIP export.
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
- **2026-04-19 — Week 6 core shipped (pay-on-download + delivery).** New
  `photoDownloadService` (`unlock` / `planBatch` / `unlockBatch`) enforces
  the two invariants: pay-once-per-version-per-org (idempotency receipt in
  `photo_downloads` — lost-tab re-downloads are free) and atomic
  debit+receipt (single `db.transaction`). Partial-fulfilment on overdraft
  is deliberate: versions charged before an `InsufficientCreditsError`
  stay unlocked, rest aren't — UI renders "unlocked N of M, top up for
  the rest" cleaner than an all-or-nothing rollback. **Dual-output
  pipeline:** every handler (`hdr-merge`, `correction-common`, `enhance`)
  now emits `clean` + `watermarked` JPEGs in parallel from the same
  source/raw buffer (`renderDualOutput`, `cleanFromRaw` +
  `watermarkFromRaw`) and stores both URLs on `editVersions`. Zero AI
  re-run at unlock — the paid path is a DB flip + credit debit + signed
  URL. **Endpoints:** `POST /projects/:id/versions/:versionId/unlock`,
  `POST /projects/:id/versions/batch-unlock` (with `planOnly` for the
  confirm UI), `GET /projects/:id/versions/download.zip?versionIds=…`
  streaming via `archiver`. **UI:** `UnlockAndDownloadButton` in the
  merged-preview block (per-version; 1-credit confirm + blob download +
  balance invalidation; 402 → shared `InsufficientCreditsDialog`;
  disabled with "No clean rendition" when `cleanOutputUrl` is null for
  pre-Week-6 rows). `PreviewDownloadButton` keeps the free watermarked
  path alive. `BatchUnlockButton` in the project header: plans across
  all bracket mergeds using cached versions queries, shows a
  `{chargeable, alreadyUnlocked, missingClean}` breakdown + balance,
  unlocks chargeable set, re-plans post-debit to filter out anything
  partial-fulfilment couldn't cover, then fetches the ZIP via authed
  `fetch` + blob download (plain `window.location` won't send the
  Authorization header). Typecheck + client build clean. Deferred:
  "Mark project delivered" flag + archive filters — retention surface
  rolls up into Week 7 polish.
- **2026-04-19 — Week 3 tail shipped.** All four remaining correction
  handlers landed: `white-balance` (gray-world CPU fallback with per-channel
  gain clamped to `[0.5, 2.0]`), `perspective` (Sharp affine transform
  fallback, rotation + shear matrix, clamped to ±15°/±0.3), `sky-replace`
  and `window-pull` (both provider-only — CPU approximations regress
  quality too often to ship). Extracted shared plumbing into
  `server/workers/handlers/correction-common.ts` (`runSingleAssetCorrection`
  handles input resolution → buffer produce → Firebase upload → atomic
  version insert → bracket pointer update). `pipeline_auto` chains
  `hdr_merge → white_balance → perspective → window_pull → sky_replace →
  enhance` with each post-HDR step best-effort so `ProviderUnavailableError`
  from unpinned models becomes a soft no-op for the whole run. When the
  bakeoff pins a Replicate version, flipping a `MODEL_REGISTRY` entry
  activates that step — zero handler changes. Typecheck clean. Week 3 is
  100% code-complete; ready to move to Week 6 unlock-download.
