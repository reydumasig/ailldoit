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
import sharp from "sharp";
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
 * Scan a buffer for all embedded JPEG images, return them ranked by
 * decoded width (largest first). This is a format-agnostic fallback
 * that works for any RAW container — CR3 (ISOBMFF), CR2 (TIFF), DNG
 * (TIFF), NEF, ARW, RAF all embed one or more JPEGs inside the file.
 *
 * CR3 specifically: Canon's newer format uses an MP4/ISOBMFF container
 * that exifr's TIFF-oriented `thumbnail()` can't parse. But the
 * embedded preview is still just a contiguous JPEG chunk in the buffer,
 * so a byte-level scan finds it reliably.
 *
 * Returns an array of candidate JPEG buffers, largest byte-length first.
 * Callers are expected to validate each with sharp before trusting it.
 */
function findEmbeddedJpegs(buffer: Buffer): Buffer[] {
  const candidates: Array<{ start: number; end: number }> = [];
  let i = 0;
  const len = buffer.length;

  // Scan for every JPEG SOI marker (FF D8 FF). The third byte guards
  // against random FF D8 pairs in sensor data — real JPEG SOIs are
  // always followed by another marker byte.
  while (i < len - 3) {
    if (
      buffer[i] === 0xff &&
      buffer[i + 1] === 0xd8 &&
      buffer[i + 2] === 0xff
    ) {
      // Found a potential SOI. Scan forward for the matching EOI
      // (FF D9). JPEGs can contain FF D9 inside compressed data, but
      // the one that ends the file is always followed by either the
      // end of buffer or a box boundary (in ISOBMFF, 4 zero bytes, or
      // another SOI marker).
      let j = i + 3;
      let lastCandidateEOI = -1;
      while (j < len - 1) {
        if (buffer[j] === 0xff && buffer[j + 1] === 0xd9) {
          lastCandidateEOI = j;
          // Peek ahead: if the next non-padding bytes look like
          // another SOI or a box header, this EOI is the real end.
          const nextIdx = j + 2;
          if (nextIdx >= len - 2) break;
          if (
            buffer[nextIdx] === 0xff &&
            buffer[nextIdx + 1] === 0xd8 &&
            buffer[nextIdx + 2] === 0xff
          ) {
            break;
          }
          // Also break on long runs of FF padding which usually mark
          // the end of a JPEG segment in RAW containers.
          if (buffer[nextIdx] === 0x00 && buffer[nextIdx + 1] === 0x00) {
            break;
          }
        }
        j++;
      }
      if (lastCandidateEOI > 0) {
        candidates.push({ start: i, end: lastCandidateEOI + 2 });
        i = lastCandidateEOI + 2;
        continue;
      }
    }
    i++;
  }

  // Slice out each candidate and sort by byte length, largest first.
  return candidates
    .map((c) => buffer.subarray(c.start, c.end))
    .sort((a, b) => b.length - a.length);
}

/**
 * Pull the largest embedded JPEG preview out of a RAW file. Two-stage:
 *   1. exifr.thumbnail() — works for TIFF-based RAW (CR2/DNG/NEF/ARW).
 *   2. Byte-level scan — works for CR3 (ISOBMFF) and as a universal
 *      fallback when exifr's thumbnail box is missing or undersized.
 *
 * Each candidate is validated by decoding its metadata with sharp —
 * that catches false positives from the byte scan (e.g. a thumbnail
 * segment hiding inside a larger JPEG's EXIF blob).
 *
 * Returns the JPEG buffer, or null if no usable preview could be extracted.
 */
async function extractRawPreview(buffer: Buffer): Promise<Buffer | null> {
  // Stage 1: exifr fast path. Cheap and correct for most formats.
  try {
    const preview = await exifr.thumbnail(buffer);
    if (preview) {
      const asBuffer = Buffer.from(preview);
      if (asBuffer.length >= MIN_PREVIEW_BYTES) {
        return asBuffer;
      }
    }
  } catch (err: any) {
    // Not fatal — fall through to the byte scan. exifr throws on CR3
    // because it doesn't grok the ISOBMFF container, and that's fine.
    console.warn(
      "⚠️ PHOTO ASSET: exifr thumbnail failed, falling back to scan:",
      err?.message
    );
  }

  // Stage 2: byte scan. Walks the whole buffer for JPEG SOI/EOI pairs
  // and returns candidates largest-first.
  const candidates = findEmbeddedJpegs(buffer);
  for (const candidate of candidates) {
    if (candidate.length < MIN_PREVIEW_BYTES) break; // sorted largest-first
    try {
      // sharp validates the JPEG by reading its header. Any well-formed
      // embedded preview decodes here; thumbnail-sized APP1/APP2 blobs
      // typically fail or report tiny dimensions.
      const meta = await sharp(candidate).metadata();
      if (
        meta.format === "jpeg" &&
        (meta.width ?? 0) >= 800 &&
        (meta.height ?? 0) >= 600
      ) {
        return candidate;
      }
    } catch {
      // Not a valid JPEG — keep scanning.
    }
  }

  return null;
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
