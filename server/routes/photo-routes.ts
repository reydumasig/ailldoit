/**
 * Photo module routes.
 *
 * Everything under /api/photo/* lives here, not in the main server/routes.ts
 * (which is already 2.3k lines of ad-generator / OAuth / admin). Keeps the
 * photo module self-contained so we can move fast and reason about tenancy
 * in one place.
 *
 * Tenancy model (Phase 1 per PRD): every authenticated request is scoped to
 * the user's active org. For MVP we always use the auto-created personal
 * org. Multi-org switching UI + invites land in Phase 1.5.
 */

import { Router, type Request, type Response } from "express";
import multer from "multer";
import archiver from "archiver";
import { Readable } from "node:stream";
import { z } from "zod";
import { authenticateToken } from "../middleware/auth";
import { setRequestUser } from "../observability/sentry";
import { track as trackEvent } from "../observability/posthog";
import { organizationService } from "../services/organization-service";
import { photoProjectService } from "../services/photo-project-service";
import { photoAssetService } from "../services/photo-asset-service";
import { bracketDetectionService } from "../services/bracket-detection-service";
import { editJobService } from "../services/edit-job-service";
import { editVersionService } from "../services/edit-version-service";
import { enqueuePhotoJob } from "../queues/photo-queue";
import {
  photoCreditService,
  getPhotoCreditPacks,
  PackNotConfiguredError,
  InsufficientCreditsError,
} from "../services/photo-credit-service";
import {
  photoDownloadService,
  NoCleanRenditionError,
  VersionNotFoundError,
} from "../services/photo-download-service";

// Uploads are held in memory so we can pipe buffers to Firebase Storage
// without a disk hop. 120MB per file — pro JPEGs run 8–20MB, but RAW files
// (CR3, DNG, NEF, ARW, RAF) can easily hit 60–90MB. 40 files per request
// covers a full bracketed property shoot.
//
// RAW note: browsers don't always send a useful mimetype for RAW (often
// "application/octet-stream"), so we also match by extension. Accepted
// formats — JPEG, PNG, HEIC/HEIF, plus RAW: CR2/CR3 (Canon), DNG (Adobe),
// NEF (Nikon), ARW (Sony), RAF (Fuji), ORF (Olympus), RW2 (Panasonic).
const RAW_EXT_RE = /\.(cr2|cr3|dng|nef|arw|raf|orf|rw2)$/i;
const STANDARD_IMAGE_MIME_RE = /^image\/(jpe?g|png|heic|heif)$/i;
const RAW_MIME_RE =
  /^image\/(x-canon-cr[23]|x-adobe-dng|x-nikon-nef|x-sony-arw|x-fuji-raf|x-olympus-orf|x-panasonic-rw2)$/i;

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 120 * 1024 * 1024,
    files: 40,
  },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype || "";
    const name = file.originalname || "";
    const ok =
      STANDARD_IMAGE_MIME_RE.test(mime) ||
      RAW_MIME_RE.test(mime) ||
      RAW_EXT_RE.test(name);
    if (!ok) {
      return cb(new Error(`Unsupported file type: ${mime || name}`));
    }
    cb(null, true);
  },
});

const router = Router();

/**
 * All photo routes require auth. We run the auto-personal-org provisioning
 * inline via resolveActiveOrgId so downstream handlers just read req.orgId.
 */
router.use(authenticateToken);

// Attach the active org id to the request for every /api/photo/* handler.
// Centralised so we can't forget to scope a query by org.
declare global {
  namespace Express {
    interface Request {
      orgId?: string;
    }
  }
}

router.use(async (req: Request, res: Response, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    req.orgId = await organizationService.resolveActiveOrgId(req.user.id);
    // Tag Sentry's request scope with orgId — auth middleware already set
    // userId + email. With both tags, issues in the Sentry dashboard can
    // be sliced by org (e.g. "show me everything failing for Acme Realty").
    setRequestUser({
      userId: req.user.id,
      email: req.user.email,
      orgId: req.orgId,
    });
    next();
  } catch (error: any) {
    console.error("❌ PHOTO: Failed to resolve active org", error);
    res.status(500).json({ message: "Could not resolve active organization" });
  }
});

// -----------------------------------------------------------------------------
// Projects
// -----------------------------------------------------------------------------

const createProjectBody = z.object({
  name: z.string().trim().min(1, "Project name is required").max(200),
  addressLine: z.string().trim().max(500).optional().nullable(),
  settings: z.record(z.unknown()).optional().nullable(),
});

router.get("/projects", async (req: Request, res: Response) => {
  try {
    const projects = await photoProjectService.listByOrg(req.orgId!);
    res.json({ projects });
  } catch (error: any) {
    console.error("❌ PHOTO: Failed to list projects", error);
    res.status(500).json({ message: "Failed to list projects" });
  }
});

router.post("/projects", async (req: Request, res: Response) => {
  const parse = createProjectBody.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      message: "Invalid project payload",
      errors: parse.error.flatten(),
    });
  }

  try {
    // Require at least editor role to create a project. Viewers are read-only
    // per PRD role matrix. Personal orgs auto-grant admin so solo users pass.
    await organizationService.requireMembership(req.user!.id, req.orgId!, "editor");

    const project = await photoProjectService.create({
      orgId: req.orgId!,
      userId: req.user!.id,
      name: parse.data.name,
      addressLine: parse.data.addressLine ?? null,
      settings: parse.data.settings ?? null,
    });
    trackEvent("photo_project_created", {
      userId: req.user!.id,
      orgId: req.orgId!,
      props: { project_id: project.id, has_address: !!parse.data.addressLine },
    });
    res.status(201).json({ project });
  } catch (error: any) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error("❌ PHOTO: Failed to create project", error);
    res.status(500).json({ message: "Failed to create project" });
  }
});

router.get("/projects/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "Invalid project id" });
  }

  try {
    const project = await photoProjectService.getByIdForOrg(id, req.orgId!);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    // Assets + bracket groups + edit versions land in the upload increment.
    res.json({ project });
  } catch (error: any) {
    console.error("❌ PHOTO: Failed to fetch project", error);
    res.status(500).json({ message: "Failed to fetch project" });
  }
});

// -----------------------------------------------------------------------------
// Assets (uploads)
// -----------------------------------------------------------------------------

/**
 * POST /api/photo/projects/:id/assets
 * Multipart upload. Field name: "files". Up to 40 images, 25MB each.
 * Parses EXIF + dimensions server-side and writes photo_assets rows.
 */
router.post(
  "/projects/:id/assets",
  // Must run multer *inside* this handler so the auth + org middleware above
  // still apply (multer is per-route, not global).
  uploadMemory.array("files", 40),
  async (req: Request, res: Response) => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project id" });
    }

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    try {
      // Require editor+ role and confirm the project belongs to the org.
      await organizationService.requireMembership(
        req.user!.id,
        req.orgId!,
        "editor"
      );
      const project = await photoProjectService.getByIdForOrg(
        projectId,
        req.orgId!
      );
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const { assets, errors } = await photoAssetService.ingestMany(
        files.map((f) => ({
          originalname: f.originalname,
          mimetype: f.mimetype,
          size: f.size,
          buffer: f.buffer,
        })),
        {
          orgId: req.orgId!,
          projectId,
          userId: req.user!.id,
        }
      );

      // Re-run bracket detection whenever new assets land so the UI never
      // shows ungrouped photos that should have been clustered. Cheap
      // (<50ms for hundreds of photos) and idempotent. Failures here are
      // logged but don't fail the upload — users can manually re-run.
      let brackets: { groupsCreated: number; assetsGrouped: number } | null = null;
      try {
        const result = await bracketDetectionService.detectForProject(projectId);
        brackets = {
          groupsCreated: result.groupsCreated,
          assetsGrouped: result.assetsGrouped,
        };
      } catch (detectErr: any) {
        console.warn(
          "⚠️ PHOTO: Bracket detection failed post-upload — user can retry manually:",
          detectErr?.message
        );
      }

      trackEvent("photo_assets_uploaded", {
        userId: req.user!.id,
        orgId: req.orgId!,
        props: {
          project_id: projectId,
          uploaded: assets.length,
          failed: errors.length,
        },
      });
      if (brackets && brackets.groupsCreated > 0) {
        trackEvent("photo_bracket_detected", {
          userId: req.user!.id,
          orgId: req.orgId!,
          props: {
            project_id: projectId,
            groups_created: brackets.groupsCreated,
            assets_grouped: brackets.assetsGrouped,
          },
        });
      }

      res.status(201).json({
        assets,
        errors, // partial-success shape; client shows which files failed
        uploaded: assets.length,
        failed: errors.length,
        brackets,
      });
    } catch (error: any) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      console.error("❌ PHOTO: Upload failed", error);
      res.status(500).json({ message: "Upload failed" });
    }
  }
);

router.get(
  "/projects/:id/assets",
  async (req: Request, res: Response) => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project id" });
    }

    try {
      // Must belong to the org — reuse the project lookup for the auth check.
      const project = await photoProjectService.getByIdForOrg(
        projectId,
        req.orgId!
      );
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const assets = await photoAssetService.listByProject(projectId);
      res.json({ assets });
    } catch (error: any) {
      console.error("❌ PHOTO: Failed to list assets", error);
      res.status(500).json({ message: "Failed to list assets" });
    }
  }
);

/**
 * POST /api/photo/projects/:id/assets/delete
 * Bulk delete source photos. Body: { assetIds: number[], force?: boolean }.
 *
 * Uses POST+body rather than DELETE with a querystring because ID lists
 * can easily exceed URL length limits once a user selects dozens of photos,
 * and most corporate proxies strip bodies from DELETE requests.
 *
 * If any target has paid download history we refuse with 409 so the UI can
 * prompt the user to confirm — resending with force=true then hard-deletes
 * everything including the receipts.
 */
router.post(
  "/projects/:id/assets/delete",
  async (req: Request, res: Response) => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project id" });
    }

    // Accept either a single-id or array-of-ids shape. Clients pick
    // whichever is more ergonomic.
    const body = req.body as { assetIds?: unknown; force?: unknown };
    const rawIds = Array.isArray(body.assetIds) ? body.assetIds : [];
    const assetIds = rawIds
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0);
    const force = body.force === true;

    if (assetIds.length === 0) {
      return res
        .status(400)
        .json({ message: "assetIds must be a non-empty array of ids" });
    }

    try {
      await organizationService.requireMembership(
        req.user!.id,
        req.orgId!,
        "editor"
      );
      const project = await photoProjectService.getByIdForOrg(
        projectId,
        req.orgId!
      );
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const result = await photoAssetService.deleteAssets(assetIds, {
        projectId,
        force,
      });

      if (result.hasPaidDownloads) {
        // 409 Conflict — the client should show a "this photo has paid
        // downloads, delete anyway?" prompt and retry with force=true.
        return res.status(409).json({
          message:
            "One or more photos have paid download receipts. Pass force=true to delete anyway.",
          hasPaidDownloads: true,
        });
      }

      // Re-run bracket detection so any cluster that now has <2 members
      // disappears from the UI immediately. Cheap and idempotent.
      let brackets: { groupsCreated: number; assetsGrouped: number } | null =
        null;
      try {
        const detect = await bracketDetectionService.detectForProject(
          projectId
        );
        brackets = {
          groupsCreated: detect.groupsCreated,
          assetsGrouped: detect.assetsGrouped,
        };
      } catch (detectErr: any) {
        console.warn(
          "⚠️ PHOTO: Post-delete bracket detection failed:",
          detectErr?.message
        );
      }

      trackEvent("photo_assets_deleted", {
        userId: req.user!.id,
        orgId: req.orgId!,
        props: {
          project_id: projectId,
          deleted: result.deletedIds.length,
          skipped: result.skippedIds.length,
          forced: force,
          storage_paths_failed: result.storagePathsFailed,
        },
      });

      return res.json({
        deleted: result.deletedIds.length,
        deletedIds: result.deletedIds,
        skipped: result.skippedIds,
        brackets,
      });
    } catch (error: any) {
      if (error.statusCode) {
        return res
          .status(error.statusCode)
          .json({ message: error.message });
      }
      console.error("❌ PHOTO: Delete assets failed", error);
      return res.status(500).json({ message: "Delete failed" });
    }
  }
);

/**
 * DELETE /api/photo/projects/:id/assets/:assetId
 * Convenience single-asset wrapper around the bulk delete service.
 * Accepts `?force=true` to override the paid-download safety check.
 */
router.delete(
  "/projects/:id/assets/:assetId",
  async (req: Request, res: Response) => {
    const projectId = Number(req.params.id);
    const assetId = Number(req.params.assetId);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project id" });
    }
    if (!Number.isFinite(assetId) || assetId <= 0) {
      return res.status(400).json({ message: "Invalid asset id" });
    }
    const force = req.query.force === "true";

    try {
      await organizationService.requireMembership(
        req.user!.id,
        req.orgId!,
        "editor"
      );
      const project = await photoProjectService.getByIdForOrg(
        projectId,
        req.orgId!
      );
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const result = await photoAssetService.deleteAssets([assetId], {
        projectId,
        force,
      });

      if (result.hasPaidDownloads) {
        return res.status(409).json({
          message:
            "This photo has paid download receipts. Retry with ?force=true to delete anyway.",
          hasPaidDownloads: true,
        });
      }
      if (result.deletedIds.length === 0) {
        return res.status(404).json({ message: "Asset not found" });
      }

      // Bracket detection pass — see the bulk handler for context.
      try {
        await bracketDetectionService.detectForProject(projectId);
      } catch (detectErr: any) {
        console.warn(
          "⚠️ PHOTO: Post-delete bracket detection failed:",
          detectErr?.message
        );
      }

      trackEvent("photo_assets_deleted", {
        userId: req.user!.id,
        orgId: req.orgId!,
        props: {
          project_id: projectId,
          deleted: 1,
          skipped: 0,
          forced: force,
          storage_paths_failed: result.storagePathsFailed,
        },
      });

      return res.json({ deleted: 1 });
    } catch (error: any) {
      if (error.statusCode) {
        return res
          .status(error.statusCode)
          .json({ message: error.message });
      }
      console.error("❌ PHOTO: Delete asset failed", error);
      return res.status(500).json({ message: "Delete failed" });
    }
  }
);

/**
 * GET /api/photo/projects/:id/assets/:assetId/versions
 * Version chain for a single asset. Used by the detail page's history
 * strip — each merge/enhance/WB pass appends one row here.
 */
router.get(
  "/projects/:id/assets/:assetId/versions",
  async (req: Request, res: Response) => {
    const projectId = Number(req.params.id);
    const assetId = Number(req.params.assetId);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project id" });
    }
    if (!Number.isFinite(assetId) || assetId <= 0) {
      return res.status(400).json({ message: "Invalid asset id" });
    }
    try {
      const project = await photoProjectService.getByIdForOrg(projectId, req.orgId!);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const versions = await editVersionService.listByAsset(assetId);
      res.json({ versions });
    } catch (error: any) {
      console.error("❌ PHOTO: Failed to list versions", error);
      res.status(500).json({ message: "Failed to list versions" });
    }
  }
);

// -----------------------------------------------------------------------------
// Bracket groups
// -----------------------------------------------------------------------------

/**
 * GET /api/photo/projects/:id/brackets
 * List the project's detected bracket groups with member assets inlined.
 * Read-only; always safe to call.
 */
router.get("/projects/:id/brackets", async (req: Request, res: Response) => {
  const projectId = Number(req.params.id);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return res.status(400).json({ message: "Invalid project id" });
  }
  try {
    const project = await photoProjectService.getByIdForOrg(projectId, req.orgId!);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    const groups = await bracketDetectionService.listForProject(projectId);
    res.json({ groups });
  } catch (error: any) {
    console.error("❌ PHOTO: Failed to list bracket groups", error);
    res.status(500).json({ message: "Failed to list bracket groups" });
  }
});

/**
 * POST /api/photo/projects/:id/brackets/detect
 * Manual re-run of bracket detection. Upload flow calls this automatically
 * already; this endpoint is for the "re-detect" button + CLI debugging.
 */
router.post(
  "/projects/:id/brackets/detect",
  async (req: Request, res: Response) => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project id" });
    }
    try {
      await organizationService.requireMembership(
        req.user!.id,
        req.orgId!,
        "editor"
      );
      const project = await photoProjectService.getByIdForOrg(projectId, req.orgId!);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const result = await bracketDetectionService.detectForProject(projectId);
      res.json({ result });
    } catch (error: any) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      console.error("❌ PHOTO: Bracket detection failed", error);
      res.status(500).json({ message: "Bracket detection failed" });
    }
  }
);

/**
 * GET /api/photo/projects/:id/exif-diagnostic
 * Dumps the parsed EXIF fields used by bracket detection for every asset
 * in a project. Internal tool — no mutation, no secrets. Lets us see at a
 * glance whether captureTime parsed correctly and where clustering would
 * put each photo.
 */
router.get(
  "/projects/:id/exif-diagnostic",
  async (req: Request, res: Response) => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project id" });
    }
    try {
      const project = await photoProjectService.getByIdForOrg(
        projectId,
        req.orgId!
      );
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const assets = await photoAssetService.listByProject(projectId);
      const rows = assets.map((a) => {
        const exif = a.exifData as {
          captureTime?: string | null;
          exposureBiasEv?: number | null;
          exposureTimeSec?: number | null;
          iso?: number | null;
          cameraModel?: string | null;
        } | null;
        return {
          id: a.id,
          fileName: a.fileName,
          bracketGroupId: a.bracketGroupId,
          captureTime: exif?.captureTime ?? null,
          captureTimeMs: exif?.captureTime
            ? new Date(exif.captureTime).getTime()
            : null,
          exposureBiasEv: exif?.exposureBiasEv ?? null,
          exposureTimeSec: exif?.exposureTimeSec ?? null,
          iso: exif?.iso ?? null,
          cameraModel: exif?.cameraModel ?? null,
        };
      });
      // Sort by captureTime to make gaps easy to read. Null-captureTime
      // rows bubble to the top so they're loud.
      rows.sort((a, b) => {
        if (a.captureTimeMs == null) return -1;
        if (b.captureTimeMs == null) return 1;
        return a.captureTimeMs - b.captureTimeMs;
      });
      // Compute the gap (seconds) between each consecutive pair so you
      // can see at a glance whether TIME_WINDOW_SEC would cluster them.
      const rowsWithGaps = rows.map((r, i) => {
        if (i === 0 || rows[i - 1].captureTimeMs == null || r.captureTimeMs == null) {
          return { ...r, gapToPrevSec: null };
        }
        return {
          ...r,
          gapToPrevSec:
            Math.round(((r.captureTimeMs - rows[i - 1].captureTimeMs!) / 1000) * 100) / 100,
        };
      });
      res.json({
        projectId,
        assetCount: rows.length,
        withCaptureTime: rows.filter((r) => r.captureTime).length,
        withoutCaptureTime: rows.filter((r) => !r.captureTime).length,
        assets: rowsWithGaps,
      });
    } catch (error: any) {
      console.error("❌ PHOTO: EXIF diagnostic failed", error);
      res.status(500).json({ message: "EXIF diagnostic failed" });
    }
  }
);

// -----------------------------------------------------------------------------
// Jobs (BullMQ roundtrip)
// -----------------------------------------------------------------------------

/**
 * POST /api/photo/projects/:id/brackets/:groupId/pipeline
 * Enqueue a pipeline_auto job for the given bracket group. Creates the
 * edit_jobs row first (status=queued), then pushes onto BullMQ carrying
 * the row id. Worker picks up from there.
 */
router.post(
  "/projects/:id/brackets/:groupId/pipeline",
  async (req: Request, res: Response) => {
    const projectId = Number(req.params.id);
    const groupId = Number(req.params.groupId);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project id" });
    }
    if (!Number.isFinite(groupId) || groupId <= 0) {
      return res.status(400).json({ message: "Invalid bracket group id" });
    }
    try {
      await organizationService.requireMembership(
        req.user!.id,
        req.orgId!,
        "editor"
      );
      const project = await photoProjectService.getByIdForOrg(projectId, req.orgId!);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const editJob = await editJobService.create({
        projectId,
        userId: req.user!.id,
        jobType: "pipeline_auto",
        bracketGroupId: groupId,
      });

      const { jobId } = await enqueuePhotoJob("pipeline_auto", {
        editJobId: editJob.id,
      });

      trackEvent("photo_render_requested", {
        userId: req.user!.id,
        orgId: req.orgId!,
        props: {
          project_id: projectId,
          bracket_group_id: groupId,
          edit_job_id: editJob.id,
          job_type: "pipeline_auto",
        },
      });

      res.status(202).json({ editJob, queueJobId: jobId });
    } catch (error: any) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      console.error("❌ PHOTO: Failed to enqueue pipeline job", error);
      res.status(500).json({ message: "Failed to enqueue pipeline job" });
    }
  }
);

/**
 * POST /api/photo/projects/:id/jobs/test
 * Dev helper: enqueue a standalone pipeline_auto with no asset/bracket
 * attached so you can validate the BullMQ roundtrip on a project that
 * doesn't happen to contain a detected bracket. Safe to ship in prod —
 * the worker's noop handler won't touch any pixels.
 */
router.post("/projects/:id/jobs/test", async (req: Request, res: Response) => {
  const projectId = Number(req.params.id);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return res.status(400).json({ message: "Invalid project id" });
  }
  try {
    await organizationService.requireMembership(
      req.user!.id,
      req.orgId!,
      "editor"
    );
    const project = await photoProjectService.getByIdForOrg(projectId, req.orgId!);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const editJob = await editJobService.create({
      projectId,
      userId: req.user!.id,
      jobType: "pipeline_auto",
    });

    const { jobId } = await enqueuePhotoJob("pipeline_auto", {
      editJobId: editJob.id,
    });

    res.status(202).json({ editJob, queueJobId: jobId });
  } catch (error: any) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error("❌ PHOTO: Failed to enqueue test job", error);
    res.status(500).json({ message: "Failed to enqueue test job" });
  }
});

/**
 * GET /api/photo/projects/:id/jobs
 * List jobs for a project. UI polls this to show progress.
 */
router.get("/projects/:id/jobs", async (req: Request, res: Response) => {
  const projectId = Number(req.params.id);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return res.status(400).json({ message: "Invalid project id" });
  }
  try {
    const project = await photoProjectService.getByIdForOrg(projectId, req.orgId!);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    const jobs = await editJobService.listForProject(projectId);
    res.json({ jobs });
  } catch (error: any) {
    console.error("❌ PHOTO: Failed to list jobs", error);
    res.status(500).json({ message: "Failed to list jobs" });
  }
});

// -----------------------------------------------------------------------------
// Credits (Week 5) — org-scoped wallet backed by photo_credit_ledger
// -----------------------------------------------------------------------------

/**
 * List available credit packs with display prices. Safe to call
 * unauthenticated in the future (for a marketing page) but for now lives
 * under /api/photo/* which requires auth. Packs with an unset Stripe
 * priceId are filtered out so the UI never shows a "buy" button that
 * wouldn't work.
 */
router.get("/credits/packs", async (_req: Request, res: Response) => {
  try {
    const packs = getPhotoCreditPacks().filter((p) => !!p.priceId);
    res.json({ packs });
  } catch (error: any) {
    console.error("❌ PHOTO: Failed to list packs", error);
    res.status(500).json({ message: "Failed to load credit packs" });
  }
});

/**
 * Return the active org's current credit balance. Drives the header chip.
 * Cheap call — single row lookup on the ledger's newest entry for the org.
 */
router.get("/credits/balance", async (req: Request, res: Response) => {
  try {
    const balance = await photoCreditService.getBalance(req.orgId!);
    res.json({ orgId: req.orgId, balance });
  } catch (error: any) {
    console.error("❌ PHOTO: Failed to read balance", error);
    res.status(500).json({ message: "Failed to load credit balance" });
  }
});

/**
 * Recent ledger entries for the active org — transactions panel.
 */
router.get("/credits/ledger", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
    const entries = await photoCreditService.listRecent(req.orgId!, limit);
    res.json({ entries });
  } catch (error: any) {
    console.error("❌ PHOTO: Failed to list ledger", error);
    res.status(500).json({ message: "Failed to load ledger" });
  }
});

const checkoutBody = z.object({
  packId: z.enum(["starter", "growth", "agency"]),
  // Client provides these so we redirect back to the right route after
  // Stripe Checkout. Keep them on the server-side of truth only via allow-list
  // of our own domain in a later hardening pass.
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

/**
 * Start a Stripe Checkout session for a credit pack. Returns a URL the
 * client should navigate to. On success, Stripe redirects back to
 * `successUrl` + session_id, and the webhook credits the org asynchronously.
 */
router.post("/credits/checkout", async (req: Request, res: Response) => {
  try {
    const parsed = checkoutBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid request",
        errors: parsed.error.flatten(),
      });
    }

    if (!req.user?.email) {
      return res.status(400).json({ message: "User email required for checkout" });
    }

    const origin = `${req.protocol}://${req.get("host")}`;
    const { sessionId, url } = await photoCreditService.createCheckoutSession({
      orgId: req.orgId!,
      userId: req.user.id,
      userEmail: req.user.email,
      packId: parsed.data.packId,
      successUrl:
        parsed.data.successUrl ??
        `${origin}/photos?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: parsed.data.cancelUrl ?? `${origin}/photos?checkout=cancelled`,
    });

    res.json({ sessionId, url });
  } catch (error: any) {
    if (error instanceof PackNotConfiguredError) {
      return res.status(503).json({
        message: "This credit pack is not available yet — please try a different pack.",
        packId: error.packId,
      });
    }
    console.error("❌ PHOTO: Failed to create checkout session", error);
    res.status(500).json({ message: "Failed to start checkout" });
  }
});

// -----------------------------------------------------------------------------
// Downloads (Week 6) — pay-on-unlock clean renditions
// -----------------------------------------------------------------------------

/**
 * POST /api/photo/projects/:id/versions/:versionId/unlock
 *
 * Pay-once-per-version unlock. Debits 1 credit if this org hasn't paid for
 * this version before, returns the clean (unwatermarked) URL either way.
 * Idempotent: lost-tab re-unlocks don't re-bill.
 *
 * Status codes:
 *   200 — unlocked (charged=false if already paid, true if freshly debited)
 *   402 — InsufficientCreditsError (not enough credits; includes balance)
 *   404 — version not found / not in this org
 *   409 — version has no clean rendition (pre-Week-6 data)
 */
router.post(
  "/projects/:id/versions/:versionId/unlock",
  async (req: Request, res: Response) => {
    const projectId = Number(req.params.id);
    const versionId = Number(req.params.versionId);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project id" });
    }
    if (!Number.isFinite(versionId) || versionId <= 0) {
      return res.status(400).json({ message: "Invalid version id" });
    }
    try {
      // Editor+ required — viewers can see watermarked previews but not unlock.
      await organizationService.requireMembership(
        req.user!.id,
        req.orgId!,
        "editor"
      );
      const project = await photoProjectService.getByIdForOrg(projectId, req.orgId!);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      trackEvent("photo_unlock_attempted", {
        userId: req.user!.id,
        orgId: req.orgId!,
        props: { project_id: projectId, version_id: versionId, mode: "single" },
      });

      const result = await photoDownloadService.unlock({
        orgId: req.orgId!,
        userId: req.user!.id,
        projectId,
        versionId,
      });

      trackEvent("photo_unlock_succeeded", {
        userId: req.user!.id,
        orgId: req.orgId!,
        props: {
          project_id: projectId,
          version_id: versionId,
          charged: result.charged,
          balance_after: result.balanceAfter,
          mode: "single",
        },
      });

      res.json({
        url: result.cleanUrl,
        charged: result.charged,
        downloadId: result.download.id,
        versionId: result.version.id,
        balanceAfter: result.balanceAfter,
      });
    } catch (error: any) {
      if (error instanceof InsufficientCreditsError) {
        trackEvent("photo_unlock_insufficient_credits", {
          userId: req.user!.id,
          orgId: req.orgId!,
          props: {
            project_id: projectId,
            version_id: versionId,
            required: error.required,
            available: error.available,
            mode: "single",
          },
        });
        return res.status(402).json({
          message: "Insufficient credits — top up to unlock this version.",
          required: error.required,
          available: error.available,
        });
      }
      if (error instanceof VersionNotFoundError) {
        return res.status(404).json({ message: error.message });
      }
      if (error instanceof NoCleanRenditionError) {
        return res.status(409).json({ message: error.message });
      }
      if (error.statusCode) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      console.error("❌ PHOTO: Unlock failed", error);
      res.status(500).json({ message: "Unlock failed" });
    }
  }
);

const batchUnlockBody = z.object({
  versionIds: z.array(z.number().int().positive()).min(1).max(50),
  /**
   * When true, we only return the plan (chargeable vs already-unlocked vs
   * missing vs invalid + total credits required). No debit, no download.
   * UI uses this to render the confirm dialog.
   */
  planOnly: z.boolean().optional(),
});

/**
 * POST /api/photo/projects/:id/versions/batch-unlock
 *
 * Two modes:
 *   - planOnly=true: returns { chargeable, alreadyUnlocked, missingClean,
 *     invalid, creditsNeeded, balance } without touching credits. Safe to
 *     call on every checkbox change.
 *   - default: debits credits for the chargeable set and returns
 *     { unlocked: UnlockResult[], failed?: { reason, required, available } }.
 *     Partial fulfilment on overdraft — caller can render "you unlocked N
 *     of M, top up to finish the rest."
 *
 * Does NOT stream a ZIP — clients call this to debit, then hit the ZIP
 * endpoint below with the resulting version ids. Keeping unlock (payment)
 * and delivery (bytes) separate means a flaky client network doesn't
 * re-bill.
 */
router.post(
  "/projects/:id/versions/batch-unlock",
  async (req: Request, res: Response) => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project id" });
    }
    const parsed = batchUnlockBody.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Invalid request", errors: parsed.error.flatten() });
    }
    try {
      await organizationService.requireMembership(
        req.user!.id,
        req.orgId!,
        "editor"
      );
      const project = await photoProjectService.getByIdForOrg(projectId, req.orgId!);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      if (parsed.data.planOnly) {
        const plan = await photoDownloadService.planBatch({
          orgId: req.orgId!,
          projectId,
          versionIds: parsed.data.versionIds,
        });
        const balance = await photoCreditService.getBalance(req.orgId!);
        return res.json({
          plan: {
            chargeable: plan.chargeable.map((v) => v.id),
            alreadyUnlocked: plan.alreadyUnlocked.map((v) => v.id),
            missingClean: plan.missingClean.map((v) => v.id),
            invalid: plan.invalid,
            creditsNeeded: plan.creditsNeeded,
          },
          balance,
        });
      }

      trackEvent("photo_unlock_attempted", {
        userId: req.user!.id,
        orgId: req.orgId!,
        props: {
          project_id: projectId,
          version_count: parsed.data.versionIds.length,
          mode: "batch",
        },
      });

      const { results, insufficient } = await photoDownloadService.unlockBatch({
        orgId: req.orgId!,
        userId: req.user!.id,
        projectId,
        versionIds: parsed.data.versionIds,
      });

      const charged = results.filter((r) => r.charged).length;
      trackEvent("photo_unlock_succeeded", {
        userId: req.user!.id,
        orgId: req.orgId!,
        props: {
          project_id: projectId,
          version_count: results.length,
          charged_count: charged,
          mode: "batch",
        },
      });
      if (insufficient) {
        trackEvent("photo_unlock_insufficient_credits", {
          userId: req.user!.id,
          orgId: req.orgId!,
          props: {
            project_id: projectId,
            required: insufficient.required,
            available: insufficient.available,
            mode: "batch",
          },
        });
      }

      const balance = await photoCreditService.getBalance(req.orgId!);
      res.json({
        unlocked: results.map((r) => ({
          versionId: r.version.id,
          url: r.cleanUrl,
          charged: r.charged,
          downloadId: r.download.id,
        })),
        failed: insufficient
          ? {
              reason: "insufficient_credits",
              required: insufficient.required,
              available: insufficient.available,
            }
          : undefined,
        balance,
      });
    } catch (error: any) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      console.error("❌ PHOTO: Batch unlock failed", error);
      res.status(500).json({ message: "Batch unlock failed" });
    }
  }
);

/**
 * GET /api/photo/projects/:id/versions/download.zip?versionIds=1,2,3
 *
 * Streams a ZIP of the clean renditions for the given versions. Does NOT
 * debit — caller must have already called batch-unlock. Versions that have
 * never been unlocked by this org are skipped (we check photo_downloads).
 * This split prevents re-billing on browser retry.
 *
 * Why GET not POST: browsers download GET responses naturally via
 * `<a download>` / window.location. POST would force a fetch+Blob dance.
 * Query-string `versionIds` works fine for the 50-item cap we enforce on
 * batch-unlock.
 */
router.get(
  "/projects/:id/versions/download.zip",
  async (req: Request, res: Response) => {
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project id" });
    }

    const raw = String(req.query.versionIds ?? "");
    const versionIds = raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (versionIds.length === 0) {
      return res
        .status(400)
        .json({ message: "versionIds query param required (comma-separated ints)" });
    }
    if (versionIds.length > 50) {
      return res.status(400).json({ message: "Too many versions — max 50 per zip" });
    }

    try {
      const project = await photoProjectService.getByIdForOrg(projectId, req.orgId!);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Plan tells us which versions are already unlocked AND have a clean
      // rendition. We only stream those — anything else would require a
      // debit, which this endpoint deliberately does not do.
      const plan = await photoDownloadService.planBatch({
        orgId: req.orgId!,
        projectId,
        versionIds,
      });
      if (plan.alreadyUnlocked.length === 0) {
        return res.status(409).json({
          message:
            "None of the requested versions have been unlocked yet. Call /versions/batch-unlock first.",
          invalid: plan.invalid,
          missingClean: plan.missingClean.map((v) => v.id),
          chargeable: plan.chargeable.map((v) => v.id),
        });
      }

      trackEvent("photo_batch_download_started", {
        userId: req.user!.id,
        orgId: req.orgId!,
        props: {
          project_id: projectId,
          version_count: plan.alreadyUnlocked.length,
          requested_count: versionIds.length,
        },
      });

      // Stream the zip. `archiver` pipes straight to the Express response
      // so memory stays bounded regardless of how many MB we're shipping.
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="ailldoit-project-${projectId}-${Date.now()}.zip"`
      );

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("warning", (warn) => {
        console.warn("⚠️ PHOTO: zip archiver warning", warn);
      });
      archive.on("error", (err) => {
        console.error("❌ PHOTO: zip archiver error", err);
        // Socket is already streaming — destroy to signal broken zip.
        res.destroy(err);
      });
      archive.pipe(res);

      // Fetch and append in bounded-parallel batches. Prior implementation
      // buffered each file into memory via `arrayBuffer()` and fetched
      // serially; piping the web-stream straight into archiver keeps
      // memory bounded, and batching by ZIP_FETCH_CONCURRENCY reduces total
      // wall-time for large batches while capping connection count to the
      // storage origin.
      const ZIP_FETCH_CONCURRENCY = 6;
      const candidates = plan.alreadyUnlocked.filter((v) => !!v.cleanOutputUrl);

      for (let i = 0; i < candidates.length; i += ZIP_FETCH_CONCURRENCY) {
        const slice = candidates.slice(i, i + ZIP_FETCH_CONCURRENCY);
        const fetched = await Promise.all(
          slice.map(async (version) => {
            try {
              const r = await fetch(version.cleanOutputUrl!);
              if (!r.ok || !r.body) {
                console.warn(
                  `⚠️ PHOTO: Skipping version ${version.id} in zip — fetch ${r.status}`
                );
                return null;
              }
              return {
                id: version.id,
                name: `version_${version.id}_clean.jpg`,
                // Node-web ReadableStream → Node Readable so archiver can
                // consume it with its own backpressure.
                stream: Readable.fromWeb(r.body as any),
              };
            } catch (entryErr: any) {
              console.warn(
                `⚠️ PHOTO: Skipping version ${version.id} in zip:`,
                entryErr?.message
              );
              return null;
            }
          })
        );

        // Append sequentially within the batch — archiver processes one
        // entry at a time, so sequential append is the natural fit. The
        // parallelism we care about is kicking off the HTTP fetches
        // concurrently (above); appending a stream is cheap.
        for (const entry of fetched) {
          if (!entry) continue;
          archive.append(entry.stream, { name: entry.name });
        }
      }

      await archive.finalize();
      trackEvent("photo_download_completed", {
        userId: req.user!.id,
        orgId: req.orgId!,
        props: {
          project_id: projectId,
          version_count: plan.alreadyUnlocked.length,
        },
      });
    } catch (error: any) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      // If we already flushed headers, we can't send JSON — log and bail.
      if (res.headersSent) {
        console.error("❌ PHOTO: zip stream failed mid-flight", error);
        return res.destroy(error);
      }
      console.error("❌ PHOTO: zip download failed", error);
      res.status(500).json({ message: "Zip download failed" });
    }
  }
);

// -----------------------------------------------------------------------------
// Current org (debug/inspection — used by client to show workspace name)
// -----------------------------------------------------------------------------

router.get("/me/org", async (req: Request, res: Response) => {
  try {
    const org = await organizationService.getOrCreatePersonalOrg(req.user!.id);
    res.json({ org });
  } catch (error: any) {
    console.error("❌ PHOTO: Failed to resolve org", error);
    res.status(500).json({ message: "Failed to resolve organization" });
  }
});

/**
 * Multer-aware error handler. Has to be the LAST middleware on the router
 * so upload errors (size limit, mimetype, too-many-files) land here before
 * Express's default 500 handler. Keep it tight — any real work should live
 * in a per-route try/catch.
 */
router.use(
  (err: any, _req: Request, res: Response, next: (err?: any) => void) => {
    if (err instanceof multer.MulterError) {
      const code = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(code).json({
        message: `Upload error: ${err.message}`,
        code: err.code,
      });
    }
    if (err && typeof err.message === "string" && err.message.startsWith("Unsupported file type")) {
      return res.status(415).json({ message: err.message });
    }
    next(err);
  }
);

export default router;
