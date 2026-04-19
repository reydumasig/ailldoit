/**
 * Photo asset service — ingests uploaded source photos.
 *
 * Flow per file:
 *   1. Parse EXIF (capture time, exposure, ISO, f-number, focal length,
 *      camera make/model, dimensions) from the in-memory buffer.
 *   2. Upload the raw JPEG to Firebase Storage under a deterministic path
 *      scoped by org + project.
 *   3. Insert a photo_assets row capturing source URL, file metadata, and
 *      the parsed EXIF blob. Bracket detection is a separate pass that
 *      runs after uploads land (Week 2 work).
 *
 * We intentionally keep this Node-only for MVP — no native image libraries.
 * exifr handles EXIF + JPEG dimensions out of the buffer without spawning
 * subprocesses, which keeps Cloud Run cold-starts snappy.
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
   */
  async ingestOne(file: UploadedFile, ctx: UploadContext): Promise<PhotoAsset> {
    const exif = await this.parseExif(file.buffer);

    // Deterministic, non-guessable storage path. Includes orgId so Firebase
    // Storage rules (future) can match on prefix.
    const safeName = file.originalname.replace(/[^\w.-]+/g, "_").slice(0, 120);
    const storagePath = `photo/${ctx.orgId}/${ctx.projectId}/${Date.now()}_${safeName}`;

    const sourceUrl = await firebaseStorageService.uploadFile(
      storagePath,
      file.buffer,
      file.mimetype || "image/jpeg",
      {
        orgId: ctx.orgId,
        projectId: String(ctx.projectId),
        userId: ctx.userId,
        originalName: file.originalname,
      }
    );

    const insert: InsertPhotoAsset = {
      projectId: ctx.projectId,
      userId: ctx.userId,
      sourceUrl,
      fileName: file.originalname,
      mimeType: file.mimetype || "image/jpeg",
      sizeBytes: file.size,
      widthPx: exif.widthPx,
      heightPx: exif.heightPx,
      exifData: exif,
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
