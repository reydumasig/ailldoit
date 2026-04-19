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
import { z } from "zod";
import { authenticateToken } from "../middleware/auth";
import { organizationService } from "../services/organization-service";
import { photoProjectService } from "../services/photo-project-service";
import { photoAssetService } from "../services/photo-asset-service";
import { bracketDetectionService } from "../services/bracket-detection-service";
import { editJobService } from "../services/edit-job-service";
import { editVersionService } from "../services/edit-version-service";
import { enqueuePhotoJob } from "../queues/photo-queue";

// Uploads are held in memory so we can pipe buffers to Firebase Storage
// without a disk hop. 25MB per file (pro-camera JPEGs run 8–20MB), up to
// 40 files per request (covers a full bracketed property shoot).
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 40,
  },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpe?g|png|heic|heif)$/i.test(file.mimetype);
    if (!ok) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}`));
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
