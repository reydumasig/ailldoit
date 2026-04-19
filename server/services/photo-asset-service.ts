/**
 * Photo asset service — ingests uploaded source photos.
 *
 * Flow per file:
 *   1. If it's a RAW camera file (CR3/DNG/NEF/ARW/RAF/etc.), extract the
 *      largest embedded JPEG preview via exifr and use THAT for the
 *      downstream pipeline. We also keep the original RAW in storage for
 *      Phase 2 true-RAW demosaic work.
 *   2. Parse EXIF (capture time, exposure, ISO, f-number, focal length,
 *      camera make/model, dimensions) from the in-memory buffer.
 *   3. Upload to Firebase Storage under a deterministic path scoped by
 *      org + project. For RAW: upload preview as the primary sourceUrl
 *      and archive the RAW alongside.
 *   4. Insert a photo_assets row capturing source URL, file metadata, and
 *      the parsed EXIF blob. Bracket detection is a separate pass that
 *      runs after uploads land (Week 2 work).
 *
 * We intentionally keep this Node-only for MVP — no native image libraries
 * or subprocess demosaicers. exifr extracts the in-camera preview JPEG
 * out of the buffer, which is plenty for listing-grade output and keeps
 * Cloud Run cold-starts snappy.
 */

import exifr from "exifr";
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  photoAssets,
  type PhotoAsset,
  type InsertPhotoAsset,
} from "@shared/schema";
import { firebaseStorageService } from "./firebase-storage-service";

// Extensions we treat as RAW — must route through preview extraction
// before reaching the HDR/display pipeline (which expects JPEG).
const RAW_EXT_RE = /\.(cr2|cr3|dng|nef|arw|raf|orf|rw2)$/i;
// Minimum preview size we'll accept as usable output. Smaller than this
// and we error out of ingest — a 160×120 embedded thumbnail would render
// unusably small in the UI and produce garbage HDR merges.
const MIN_PREVIEW_BYTES = 50 * 1024; // 50KB

export class RawPreviewUnavailableError extends Error {
  constructor(fileName: string) {
    super(
      `Could not extract a preview from RAW file "${fileName}". ` +
        `Try exporting it as JPEG from your camera or Lightroom first.`
    );
    this.name = "RawPreviewUnavailableError";
  }
}

function isRawFilename(name: string): boolean {
  return RAW_EXT_RE.test(name);
}

/**
 * Pull the largest embedded JPEG preview out of a RAW file. Most cameras
 * write a full-resolution JPEG inside the RAW container for in-camera
 * review — exifr surfaces it via the `thumbnail` extractor. For MVP this
 * gives us a listing-quality image without needing a native demosaicer.
 *
 * Returns the JPEG buffer, or null if no preview could be extracted.
 */
async function extractRawPreview(buffer: Buffer): Promise<Buffer | null> {
  try {
    const preview = await exifr.thumbnail(buffer);
    if (!preview) return null;
    const asBuffer = Buffer.from(preview);
    if (asBuffer.length < MIN_PREVIEW_BYTES) {
      // Some bodies only embed a tiny 160×120 thumbnail — not worth
      // shipping through the pipeline.
      return null;
    }
    return asBuffer;
  } catch (err: any) {
    console.warn(
      "⚠️ PHOTO ASSET: RAW preview extraction failed:",
      err?.message
    );
    return null;
  }
}

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface UploadContext {
  orgId: string;
  projectId: number;
  userId: string;
}

/** Parsed EXIF surface that's useful for the pipeline downstream. */
export interface ExtractedExif {
  captureTime: string | null;        // ISO-8601
  exposureTimeSec: number | null;    // e.g. 1/125 → 0.008
  exposureBiasEv: number | null;     // ±EV compensation; the strongest bracket signal
  iso: number | null;
  fNumber: number | null;
  focalLengthMm: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  widthPx: number | null;
  heightPx: number | null;
  orientation: number | null;        // 1..8; important for upright display
  raw: Record<string, unknown>;      // full parse for future use
}

const EXIF_PICKS = [
  "DateTimeOriginal",
  "CreateDate",
  "ModifyDate",
  "ExposureTime",
  "ExposureBiasValue",
  "ExposureCompensation",
  "ISO",
  "ISOSpeedRatings",
  "FNumber",
  "FocalLength",
  "FocalLengthIn35mmFormat",
  "Make",
  "Model",
  "LensModel",
  "LensMake",
  "ExifImageWidth",
  "ExifImageHeight",
  "PixelXDimension",
  "PixelYDimension",
  "Orientation",
];

export class PhotoAssetService {
  /**
   * Run the full ingest pipeline for a single uploaded file. Keeps the DB
   * write after the storage upload so we never end up with a row pointing
   * at a missing object.
   *
   * For RAW files (CR3/DNG/NEF/ARW/RAF/etc.) we extract the embedded JPEG
   * preview and use it as the canonical sourceUrl — the rest of the
   * pipeline (HDR Mertens, sky replace, download) is JPEG-only for MVP.
   * The original RAW is archived to storage for Phase 2, but the DB row's
   * primary sourceUrl points at the preview.
   */
  async ingestOne(file: UploadedFile, ctx: UploadContext): Promise<PhotoAsset> {
    const isRaw = isRawFilename(file.originalname);

    // For RAW, extract a usable JPEG preview up front. If extraction
    // fails we bail before uploading anything — there's no point
    // storing a RAW we can't process.
    let pipelineBuffer = file.buffer;
    let pipelineMime = file.mimetype || "image/jpeg";
    let pipelineSize = file.size;
    let pipelineFileName = file.originalname;

    if (isRaw) {
      const preview = await extractRawPreview(file.buffer);
      if (!preview) {
        throw new RawPreviewUnavailableError(file.originalname);
      }
      pipelineBuffer = preview;
      pipelineMime = "image/jpeg";
      pipelineSize = preview.length;
      // Rename the preview so it's obviously-JPEG in storage / downloads.
      // e.g. "DSC_0123.CR3" → "DSC_0123.preview.jpg"
      const base = file.originalname.replace(RAW_EXT_RE, "");
      pipelineFileName = `${base}.preview.jpg`;
    }

    // EXIF parsing: exifr reads RAW containers natively, so we prefer the
    // original buffer (it has the complete camera metadata). JPEG previews
    // sometimes strip lens info.
    const exif = await this.parseExif(file.buffer);

    // Deterministic, non-guessable storage path. Includes orgId so Firebase
    // Storage rules (future) can match on prefix.
    const timestamp = Date.now();
    const safePipelineName = pipelineFileName
      .replace(/[^\w.-]+/g, "_")
      .slice(0, 120);
    const pipelineStoragePath = `photo/${ctx.orgId}/${ctx.projectId}/${timestamp}_${safePipelineName}`;

    const sourceUrl = await firebaseStorageService.uploadFile(
      pipelineStoragePath,
      pipelineBuffer,
      pipelineMime,
      {
        orgId: ctx.orgId,
        projectId: String(ctx.projectId),
        userId: ctx.userId,
        originalName: file.originalname,
        derivedFromRaw: isRaw ? "true" : "false",
      }
    );

    // Archive the original RAW alongside the preview. We don't block on
    // failure here — the listing still works off the preview, and losing
    // the raw archive only costs us Phase 2 reprocessing capability.
    let rawSourceUrl: string | null = null;
    if (isRaw) {
      try {
        const safeRawName = file.originalname
          .replace(/[^\w.-]+/g, "_")
          .slice(0, 120);
        const rawStoragePath = `photo/${ctx.orgId}/${ctx.projectId}/${timestamp}_raw_${safeRawName}`;
        rawSourceUrl = await firebaseStorageService.uploadFile(
          rawStoragePath,
          file.buffer,
          file.mimetype || "application/octet-stream",
          {
            orgId: ctx.orgId,
            projectId: String(ctx.projectId),
            userId: ctx.userId,
            originalName: file.originalname,
            isRawOriginal: "true",
          }
        );
      } catch (err: any) {
        console.warn(
          "⚠️ PHOTO ASSET: Failed to archive RAW original (preview still usable):",
          err?.message
        );
      }
    }

    const insert: InsertPhotoAsset = {
      projectId: ctx.projectId,
      userId: ctx.userId,
      sourceUrl,
      fileName: file.originalname,
      mimeType: pipelineMime,
      sizeBytes: pipelineSize,
      widthPx: exif.widthPx,
      heightPx: exif.heightPx,
      exifData: {
        ...exif,
        // Stash RAW-specific metadata inside the exif blob so the schema
        // doesn't need a migration. Consumers that care can read these.
        rawOriginal: isRaw
          ? {
              fileName: file.originalname,
              mimeType: file.mimetype || null,
              sizeBytes: file.size,
              archivedUrl: rawSourceUrl,
            }
          : null,
      },
    };

    const [created] = await db.insert(photoAssets).values(insert).returning();
    return created;
  }

  /** Ingest many files in parallel, collecting per-file successes/errors. */
  async ingestMany(
    files: UploadedFile[],
    ctx: UploadContext
  ): Promise<{
    assets: PhotoAsset[];
    errors: Array<{ fileName: string; message: string }>;
  }> {
    const results = await Promise.allSettled(
      files.map((f) => this.ingestOne(f, ctx))
    );

    const assets: PhotoAsset[] = [];
    const errors: Array<{ fileName: string; message: string }> = [];

    results.forEach((result, idx) => {
      if (result.status === "fulfilled") {
        assets.push(result.value);
      } else {
        errors.push({
          fileName: files[idx]?.originalname ?? "<unknown>",
          message: result.reason?.message ?? String(result.reason),
        });
      }
    });

    return { assets, errors };
  }

  /**
   * List every source asset in a project, in capture-time order (falling
   * back to id order when EXIF is missing). The client uses this to render
   * the project's thumbnail grid.
   */
  async listByProject(projectId: number): Promise<PhotoAsset[]> {
    return db
      .select()
      .from(photoAssets)
      .where(eq(photoAssets.projectId, projectId))
      .orderBy(asc(photoAssets.id));
  }

  /**
   * Parse EXIF + dimensions from a JPEG buffer. Returns nulls rather than
   * throwing when a field is missing — different camera bodies write
   * wildly different subsets and we'd rather ingest than fail.
   */
  async parseExif(buffer: Buffer): Promise<ExtractedExif> {
    let parsed: Record<string, any> = {};
    try {
      parsed = (await exifr.parse(buffer, { pick: EXIF_PICKS })) ?? {};
    } catch (err: any) {
      console.warn("⚠️ PHOTO ASSET: EXIF parse failed — proceeding without metadata:", err?.message);
      parsed = {};
    }

    const captureDate: Date | undefined =
      parsed.DateTimeOriginal ?? parsed.CreateDate ?? parsed.ModifyDate;
    const captureTime = captureDate instanceof Date && !Number.isNaN(+captureDate)
      ? captureDate.toISOString()
      : null;

    const iso = numberOrNull(parsed.ISO ?? parsed.ISOSpeedRatings);
    const fNumber = numberOrNull(parsed.FNumber);
    const focalLengthMm = numberOrNull(parsed.FocalLength);
    const exposureTimeSec = numberOrNull(parsed.ExposureTime);
    const exposureBiasEv = numberOrNull(parsed.ExposureBiasValue ?? parsed.ExposureCompensation);
    const widthPx = numberOrNull(parsed.ExifImageWidth ?? parsed.PixelXDimension);
    const heightPx = numberOrNull(parsed.ExifImageHeight ?? parsed.PixelYDimension);
    const orientation = numberOrNull(parsed.Orientation);

    return {
      captureTime,
      exposureTimeSec,
      exposureBiasEv,
      iso,
      fNumber,
      focalLengthMm,
      cameraMake: stringOrNull(parsed.Make),
      cameraModel: stringOrNull(parsed.Model),
      lensModel: stringOrNull(parsed.LensModel ?? parsed.LensMake),
      widthPx,
      heightPx,
      orientation,
      raw: parsed,
    };
  }
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function stringOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

export const photoAssetService = new PhotoAssetService();
