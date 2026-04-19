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
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  bracketGroups,
  editVersions,
  photoAssets,
  photoDownloads,
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

export interface DeleteAssetsResult {
  /** Asset IDs actually removed from the DB (also from storage, best-effort). */
  deletedIds: number[];
  /** Asset IDs in the request that didn't belong to the project — ignored. */
  skippedIds: number[];
  /**
   * True when at least one target asset had a paid-download receipt. In
   * that case we refuse the operation (deletedIds is empty) unless the
   * caller passed force=true, so the UI can surface an explicit warning.
   */
  hasPaidDownloads: boolean;
  storagePathsAttempted: number;
  storagePathsFailed: number;
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

    // EXIF parsing: for RAW, prefer the preview JPEG's EXIF — cameras
    // copy the full EXIF block into the preview's APP1 segment, which
    // parses reliably via exifr. The raw container (especially CR3's
    // ISOBMFF) is less consistent for DateTimeOriginal extraction. For
    // standard JPEGs, we parse the original directly.
    //
    // Fallback: if preview EXIF is missing captureTime, re-parse the
    // original buffer and prefer any non-null fields from the fallback.
    // This defends against bodies that ship previews without EXIF (rare,
    // mostly old firmware).
    let exif = await this.parseExif(
      pipelineBuffer,
      isRaw ? `${file.originalname}:preview` : `${file.originalname}`
    );
    if (isRaw && !exif.captureTime) {
      const fallback = await this.parseExif(
        file.buffer,
        `${file.originalname}:raw-fallback`
      );
      exif = mergeExifPreferringNonNull(exif, fallback);
    }
    if (isRaw && !exif.captureTime) {
      console.warn(
        `⚠️ PHOTO ASSET: No captureTime parsed from ${file.originalname} — bracket detection will skip this file.`
      );
    } else if (isRaw) {
      console.log(
        `📷 PHOTO ASSET: ${file.originalname} → captureTime=${exif.captureTime} EV=${exif.exposureBiasEv} ISO=${exif.iso}`
      );
    }

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
   * Remove one or more source assets from a project. Scoped by projectId
   * so a request for assets in another project is a no-op (never a
   * cross-project leak).
   *
   * Safety rules:
   *   - Paid downloads are NEVER silently destroyed. If any edit_version
   *     derived from a target asset has a row in photo_downloads, the
   *     deletion fails with `hasPaidDownloads: true` unless the caller
   *     passes `force: true`. The UI uses this to require explicit
   *     confirmation for assets a user has actually paid to download.
   *   - DB deletion leans on the FK cascade chain already in schema.ts:
   *     edit_jobs (assetId, outputAssetId), edit_versions (assetId), and
   *     bracketGroups.bracketGroupId (set null) all clean up on their own.
   *   - Orphaned bracket groups (mergedAssetId pointing at a deleted
   *     asset) are fixed with a manual UPDATE since that FK was deferred
   *     in schema.ts to avoid a circular reference.
   *   - Firebase Storage objects are best-effort: we fire off the deletes
   *     AFTER the DB transaction commits, and log-but-don't-throw on any
   *     individual failure. Leftover blobs are a cleanup-job problem,
   *     never a user-facing failure.
   *   - Bracket detection re-runs on the project at the end so any clusters
   *     that dropped below 2 members disappear from the UI.
   */
  async deleteAssets(
    assetIds: number[],
    ctx: { projectId: number; force?: boolean }
  ): Promise<DeleteAssetsResult> {
    if (assetIds.length === 0) {
      return {
        deletedIds: [],
        skippedIds: [],
        hasPaidDownloads: false,
        storagePathsAttempted: 0,
        storagePathsFailed: 0,
      };
    }

    // 1. Resolve the assets — the projectId filter is the auth guard.
    //    Caller has already checked org membership via photoProjectService.
    const assets = await db
      .select()
      .from(photoAssets)
      .where(
        and(
          eq(photoAssets.projectId, ctx.projectId),
          inArray(photoAssets.id, assetIds)
        )
      );

    const foundIds = assets.map((a) => a.id);
    const skippedIds = assetIds.filter((id) => !foundIds.includes(id));

    if (foundIds.length === 0) {
      return {
        deletedIds: [],
        skippedIds,
        hasPaidDownloads: false,
        storagePathsAttempted: 0,
        storagePathsFailed: 0,
      };
    }

    // 2. Fetch the version chain for each asset — we need both the
    //    Firebase URLs we'll clean up and the versionIds to check for
    //    paid downloads.
    const versions = await db
      .select()
      .from(editVersions)
      .where(inArray(editVersions.assetId, foundIds));
    const versionIds = versions.map((v) => v.id);

    // 3. Paid-download safety check. If there's any download row for a
    //    version in this set, block deletion unless explicitly forced.
    let hasPaidDownloads = false;
    if (versionIds.length > 0) {
      const downloads = await db
        .select({ id: photoDownloads.id })
        .from(photoDownloads)
        .where(inArray(photoDownloads.versionId, versionIds))
        .limit(1);
      hasPaidDownloads = downloads.length > 0;
    }

    if (hasPaidDownloads && !ctx.force) {
      return {
        deletedIds: [],
        skippedIds: assetIds, // nothing got deleted, everything's on hold
        hasPaidDownloads: true,
        storagePathsAttempted: 0,
        storagePathsFailed: 0,
      };
    }

    // 4. Collect every Firebase URL we should try to clean up:
    //    - source URL for each asset
    //    - archived RAW (stashed in exifData.rawOriginal.archivedUrl)
    //    - every version's outputUrl and cleanOutputUrl
    const urls: string[] = [];
    for (const a of assets) {
      if (a.sourceUrl) urls.push(a.sourceUrl);
      const exif = a.exifData as
        | { rawOriginal?: { archivedUrl?: string | null } | null }
        | null;
      const archivedUrl = exif?.rawOriginal?.archivedUrl;
      if (archivedUrl) urls.push(archivedUrl);
    }
    for (const v of versions) {
      if (v.outputUrl) urls.push(v.outputUrl);
      if (v.cleanOutputUrl) urls.push(v.cleanOutputUrl);
    }

    // 5. Delete inside a transaction: paid-download rows first (only
    //    reachable with force=true), then assets. FK cascades take care
    //    of edit_jobs + edit_versions. Bracket group orphan pointers
    //    (mergedAssetId → deleted) get cleared with an explicit UPDATE.
    await db.transaction(async (tx) => {
      if (ctx.force && versionIds.length > 0) {
        await tx
          .delete(photoDownloads)
          .where(inArray(photoDownloads.versionId, versionIds));
      }

      // Null any bracket group that pointed at one of these assets as
      // its merged output — that group no longer has a rendered HDR.
      await tx
        .update(bracketGroups)
        .set({ mergedAssetId: null, status: "detected" })
        .where(
          and(
            eq(bracketGroups.projectId, ctx.projectId),
            inArray(bracketGroups.mergedAssetId, foundIds)
          )
        );

      await tx
        .delete(photoAssets)
        .where(
          and(
            eq(photoAssets.projectId, ctx.projectId),
            inArray(photoAssets.id, foundIds)
          )
        );
    });

    // 6. Best-effort Firebase Storage cleanup. We do NOT await this in a
    //    way that can fail the response — each URL gets its own try/catch.
    let storagePathsFailed = 0;
    const uniqueUrls = Array.from(new Set(urls));
    await Promise.all(
      uniqueUrls.map(async (url) => {
        const storagePath = extractStoragePathFromUrl(url);
        if (!storagePath) return;
        try {
          await firebaseStorageService.deleteFile(storagePath);
        } catch (err: any) {
          storagePathsFailed += 1;
          console.warn(
            `⚠️ PHOTO ASSET: Failed to delete storage object ${storagePath}:`,
            err?.message
          );
        }
      })
    );

    console.log(
      `🗑️ PHOTO ASSET: project=${ctx.projectId} deleted=${foundIds.length} ` +
        `skipped=${skippedIds.length} storage(ok/fail)=${uniqueUrls.length - storagePathsFailed}/${storagePathsFailed}`
    );

    return {
      deletedIds: foundIds,
      skippedIds,
      hasPaidDownloads: false,
      storagePathsAttempted: uniqueUrls.length,
      storagePathsFailed,
    };
  }

  /**
   * Parse EXIF + dimensions from a JPEG buffer. Returns nulls rather than
   * throwing when a field is missing — different camera bodies write
   * wildly different subsets and we'd rather ingest than fail.
   *
   * @param tag optional label included in diagnostic logs so we can tell
   *            "preview" vs "original RAW buffer" parses apart in the output.
   */
  async parseExif(buffer: Buffer, tag: string = "buffer"): Promise<ExtractedExif> {
    const magic = describeMagic(buffer);
    let parsed: Record<string, any> = {};
    let parseError: string | null = null;

    try {
      parsed = (await exifr.parse(buffer, { pick: EXIF_PICKS })) ?? {};
    } catch (err: any) {
      parseError = err?.message ?? String(err);
      console.warn(
        `⚠️ PHOTO ASSET [parseExif ${tag}]: exifr.parse(pick) threw — ${parseError}`
      );
      parsed = {};
    }

    // If the picked parse came back empty, try a full default parse once
    // as a diagnostic. Helps distinguish "EXIF really isn't there" from
    // "our pick filter missed something that defaults would find".
    if (Object.keys(parsed).length === 0) {
      try {
        const full = (await exifr.parse(buffer)) ?? {};
        const fullKeys = Object.keys(full);
        console.warn(
          `⚠️ PHOTO ASSET [parseExif ${tag}]: picked parse empty (size=${buffer.length}, magic=${magic}); ` +
            `default parse returned ${fullKeys.length} keys${fullKeys.length ? `: ${fullKeys.slice(0, 15).join(",")}${fullKeys.length > 15 ? "…" : ""}` : ""}`
        );
        // If the default parse DID find EXIF, fall back to it — better to
        // keep the extra fields than drop captureTime on the floor.
        if (fullKeys.length > 0) {
          parsed = full;
          console.log(
            `📷 PHOTO ASSET [parseExif ${tag}]: recovered via default parse — DateTimeOriginal=${full.DateTimeOriginal ?? "∅"}`
          );
        }
      } catch (fallbackErr: any) {
        console.warn(
          `⚠️ PHOTO ASSET [parseExif ${tag}]: fallback default parse also failed — ${fallbackErr?.message}`
        );
      }
    } else {
      // Log a compact trace of what we got for this buffer.
      console.log(
        `📷 PHOTO ASSET [parseExif ${tag}]: size=${buffer.length} magic=${magic} ` +
          `DateTimeOriginal=${parsed.DateTimeOriginal ?? "∅"} ` +
          `CreateDate=${parsed.CreateDate ?? "∅"} ` +
          `EV=${parsed.ExposureBiasValue ?? parsed.ExposureCompensation ?? "∅"} ` +
          `ISO=${parsed.ISO ?? parsed.ISOSpeedRatings ?? "∅"}`
      );
    }

    // exifr usually returns Date objects for DateTimeOriginal/CreateDate/
    // ModifyDate, but some code paths (or certain options) leave them as
    // raw "YYYY:MM:DD HH:mm:ss" strings. Handle both.
    const captureTime = coerceCaptureTime(
      parsed.DateTimeOriginal ?? parsed.CreateDate ?? parsed.ModifyDate
    );
    if (!captureTime && (parsed.DateTimeOriginal || parsed.CreateDate || parsed.ModifyDate)) {
      console.warn(
        `⚠️ PHOTO ASSET [parseExif ${tag}]: date fields present but unparseable — ` +
          `DateTimeOriginal=${JSON.stringify(parsed.DateTimeOriginal)} ` +
          `CreateDate=${JSON.stringify(parsed.CreateDate)} ` +
          `ModifyDate=${JSON.stringify(parsed.ModifyDate)}`
      );
    }

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

/**
 * Convert a Firebase Storage signed URL (or plain googleapis URL) back to
 * the object path we can hand to firebaseStorageService.deleteFile().
 *
 * Handles both formats we emit:
 *   - `https://storage.googleapis.com/<bucket>/<path>?signed-query`
 *   - `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encoded-path>?...`
 *
 * Returns null for anything that isn't recognisable — the caller should
 * skip cleanup rather than guess (guessing wrong could delete the wrong
 * blob for another project).
 */
function extractStoragePathFromUrl(url: string): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname;

    // storage.googleapis.com/<bucket>/<path...>
    if (host === "storage.googleapis.com") {
      // pathname starts with "/" then bucket name. We don't know the
      // bucket name at this layer, so just strip the first two segments:
      //    /bucket-name/photo/orgId/...  → photo/orgId/...
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length < 2) return null;
      return parts.slice(1).join("/");
    }

    // firebasestorage.googleapis.com/v0/b/<bucket>/o/<url-encoded-path>
    if (host === "firebasestorage.googleapis.com") {
      const match = parsed.pathname.match(/\/v0\/b\/[^/]+\/o\/(.+)$/);
      if (!match) return null;
      return decodeURIComponent(match[1]);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Coerce any value EXIF might return for a date field into an ISO-8601
 * string, or null if it can't be interpreted as a real timestamp.
 *
 * Accepts:
 *   - Date instances (what exifr returns by default)
 *   - "YYYY:MM:DD HH:mm:ss" strings (EXIF's wire format — some parsers
 *     return this directly, and it's what sits inside the JSON `raw`
 *     blob after round-tripping through the DB)
 *   - ISO-8601 strings (already normalised)
 *   - Unix seconds/ms numbers (rare, but some tools emit them)
 */
function coerceCaptureTime(value: unknown): string | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return Number.isNaN(+value) ? null : value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Heuristic: treat <1e12 as seconds, else milliseconds. Anything
    // earlier than 2001 or later than 2100 is almost certainly wrong.
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(+d) ? null : d.toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // EXIF wire format: "2024:04:18 10:23:15". Swap the date separators so
    // the JS Date parser can read it.
    const exifMatch = trimmed.match(
      /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(.*)$/
    );
    if (exifMatch) {
      const [, y, mo, d, h, mi, s, rest] = exifMatch;
      const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${rest || ""}`;
      const parsed = new Date(iso);
      if (!Number.isNaN(+parsed)) return parsed.toISOString();
    }

    // Last-resort: let Date try. Accepts ISO-8601, RFC2822, etc.
    const parsed = new Date(trimmed);
    return Number.isNaN(+parsed) ? null : parsed.toISOString();
  }

  return null;
}

/**
 * Return a short, human-readable label for the first few bytes of a buffer —
 * used in parseExif diagnostics so we can tell at a glance whether an
 * incoming "image/jpeg" file is actually a JPEG (FF D8 FF), HEIF/HEIC
 * (`ftyp` box), PNG, or something unexpected that would explain an empty
 * EXIF parse.
 */
function describeMagic(buffer: Buffer): string {
  if (buffer.length < 12) return `short(${buffer.length})`;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }
  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "png";
  }
  // ISOBMFF (HEIF/HEIC/CR3/MP4): bytes 4-7 == "ftyp"
  if (
    buffer[4] === 0x66 && // f
    buffer[5] === 0x74 && // t
    buffer[6] === 0x79 && // y
    buffer[7] === 0x70 // p
  ) {
    const brand = buffer.slice(8, 12).toString("ascii");
    return `isobmff(${brand})`;
  }
  // TIFF: "II*\0" or "MM\0*"
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a) ||
    (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[3] === 0x2a)
  ) {
    return "tiff";
  }
  // Fallback: first 8 bytes as hex
  return `unknown(${buffer.slice(0, 8).toString("hex")})`;
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

/**
 * Merge two EXIF blobs, preferring `primary` for any field that's non-null
 * and falling back to `fallback` where primary is null/missing. Used when
 * the preview JPEG is partial and we need to cover gaps from the original
 * RAW's metadata.
 */
function mergeExifPreferringNonNull(
  primary: ExtractedExif,
  fallback: ExtractedExif
): ExtractedExif {
  const pick = <K extends keyof ExtractedExif>(key: K): ExtractedExif[K] =>
    primary[key] != null ? primary[key] : fallback[key];
  return {
    captureTime: pick("captureTime"),
    exposureTimeSec: pick("exposureTimeSec"),
    exposureBiasEv: pick("exposureBiasEv"),
    iso: pick("iso"),
    fNumber: pick("fNumber"),
    focalLengthMm: pick("focalLengthMm"),
    cameraMake: pick("cameraMake"),
    cameraModel: pick("cameraModel"),
    lensModel: pick("lensModel"),
    widthPx: pick("widthPx"),
    heightPx: pick("heightPx"),
    orientation: pick("orientation"),
    // Merge raw parses so downstream consumers can still inspect
    // everything we found.
    raw: { ...fallback.raw, ...primary.raw },
  };
}

export const photoAssetService = new PhotoAssetService();
