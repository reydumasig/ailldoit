/**
 * enhance handler — post-HDR polish pass.
 *
 * Runs the merged HDR preview through a general-purpose enhancer (contrast,
 * vibrance, micro-contrast, light denoise). MVP behaviour:
 *
 *   - If the active provider can fulfil "enhance" (Replicate w/ pinned
 *     model), upload the result as a new derived photo_assets row +
 *     edit_versions row. Bumps editVersions.versionNumber + flips
 *     isCurrent so the UI slider jumps to the polished version.
 *
 *   - If the provider throws ProviderUnavailableError (no token, or model
 *     not yet pinned), fall back to a local Sharp-based tone curve. The
 *     fallback is deliberately conservative — a gentle S-curve on
 *     luminance + slight saturation lift — so local-dev output at least
 *     changes visibly without looking oversaturated.
 *
 * Input: the job's assetId OR the merged mergedAssetId of its bracket.
 * Output: a new photoAsset (derivedFromJobId = this job), plus an
 * editVersions row with isCurrent=true that supersedes the HDR version.
 */

import sharp from "sharp";
import { and, desc, eq } from "drizzle-orm";
import type {
  EditJob,
  PhotoAsset,
  InsertEditVersion,
  InsertPhotoAsset,
} from "@shared/schema";
import { db } from "../../db";
import {
  bracketGroups,
  editVersions,
  photoAssets,
} from "@shared/schema";
import { firebaseStorageService } from "../../services/firebase-storage-service";
import {
  getPhotoModelProvider,
  ProviderUnavailableError,
} from "../../services/photo-providers";
import type { HandlerResult } from "./pipeline-auto";

/** Sharpening / vibrance strength used by the local fallback. */
const LOCAL_SATURATION_LIFT = 1.08;
const LOCAL_SHARPEN_SIGMA = 0.6;

export async function handleEnhance(job: EditJob): Promise<HandlerResult> {
  const started = Date.now();

  // 1. Resolve the input asset. Prefer an explicit assetId on the job;
  //    otherwise grab the most recent merged output for the bracket.
  const inputAsset = await resolveInputAsset(job);
  if (!inputAsset) {
    throw new Error(
      `enhance job ${job.id}: could not resolve an input asset (assetId=${job.assetId ?? "-"}, bracketGroupId=${job.bracketGroupId ?? "-"})`
    );
  }

  // 2. Try the configured provider. Fall back to local Sharp curve on
  //    ProviderUnavailableError (no token / model not pinned).
  const provider = getPhotoModelProvider();
  let outputBuffer: Buffer;
  let costCents = 0;
  let providerMeta: Record<string, unknown> = { provider: "local-fallback" };

  try {
    const result = await provider.run({
      imageUrls: [inputAsset.sourceUrl],
      model: "enhance",
      editJobId: job.id,
      projectId: job.projectId,
    });
    // Replicate returns a URL — pull it down so we control the storage.
    const res = await fetch(result.outputUrl);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch provider output: ${res.status} ${res.statusText}`
      );
    }
    outputBuffer = Buffer.from(await res.arrayBuffer());
    costCents = result.costCents;
    providerMeta = { ...(result.providerMeta ?? {}), fallback: false };
  } catch (err) {
    if (!(err instanceof ProviderUnavailableError)) throw err;
    console.log(
      `🎛️  ENHANCE: provider unavailable (${err.message}) — using local tone curve`
    );
    outputBuffer = await localEnhance(inputAsset.sourceUrl);
  }

  // 3. Upload the polished JPEG under a deterministic path.
  const storagePath = `photo/${inferOrgId(inputAsset)}/${job.projectId}/enhanced/asset_${inputAsset.id}_${Date.now()}_preview.jpg`;
  const outputUrl = await firebaseStorageService.uploadFile(
    storagePath,
    outputBuffer,
    "image/jpeg",
    {
      editJobId: String(job.id),
      sourceAssetId: String(inputAsset.id),
      kind: "enhance_preview",
    }
  );

  // 4. Persist the new version. We bump versionNumber relative to the
  //    highest existing version for this asset, and flip isCurrent over.
  const result = await db.transaction(async (tx) => {
    // Capture image metadata from the buffer once so both the asset row
    // and the DB match what's actually on disk.
    const meta = await sharp(outputBuffer).metadata();

    const insertAsset: InsertPhotoAsset = {
      projectId: job.projectId,
      userId: job.userId,
      sourceUrl: outputUrl,
      fileName: `asset_${inputAsset.id}_enhanced.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: outputBuffer.byteLength,
      widthPx: meta.width ?? null,
      heightPx: meta.height ?? null,
      exifData: null,
      derivedFromJobId: job.id,
    };
    const [derived] = await tx.insert(photoAssets).values(insertAsset).returning();

    // Find the current top version on the *input* asset so we know what
    // to supersede. Editversions keys on assetId — the input is the HDR
    // merged asset; new rendition is derived but linked into the same
    // version chain via assetId.
    const [prev] = await tx
      .select()
      .from(editVersions)
      .where(eq(editVersions.assetId, inputAsset.id))
      .orderBy(desc(editVersions.versionNumber))
      .limit(1);

    const nextVersion = (prev?.versionNumber ?? 0) + 1;

    // Demote the previous current version.
    if (prev) {
      await tx
        .update(editVersions)
        .set({ isCurrent: false })
        .where(
          and(
            eq(editVersions.assetId, inputAsset.id),
            eq(editVersions.isCurrent, true)
          )
        );
    }

    const insertVersion: InsertEditVersion = {
      assetId: inputAsset.id,
      jobId: job.id,
      versionNumber: nextVersion,
      outputUrl,
      watermarked: true,
      isCurrent: true,
    };
    await tx.insert(editVersions).values(insertVersion);

    // If the input was a bracket's merged asset, keep the group pointer
    // tracking the latest rendition so the detail page shows the polished
    // preview instead of the raw HDR.
    if (job.bracketGroupId) {
      await tx
        .update(bracketGroups)
        .set({ mergedAssetId: derived.id, status: "enhanced" })
        .where(eq(bracketGroups.id, job.bracketGroupId));
    }

    return derived;
  });

  return {
    outputAssetId: result.id,
    costCents,
    durationMs: Date.now() - started,
    providerMeta,
  };
}

// -----------------------------------------------------------------------------
// Local tone-curve fallback — used when REPLICATE_API_TOKEN isn't set.
// -----------------------------------------------------------------------------

async function localEnhance(sourceUrl: string): Promise<Buffer> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Failed to fetch source: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  return sharp(buf, { failOn: "none" })
    .rotate()
    // `modulate` applies a multiplicative adjustment per channel in HSL-ish
    // space. 1.04 brightness + 1.08 saturation = noticeable but not garish.
    .modulate({ brightness: 1.04, saturation: LOCAL_SATURATION_LIFT })
    // Gentle micro-contrast. Sharp's sharpen uses a Laplacian; sigma 0.6
    // hits detail without ringing.
    .sharpen({ sigma: LOCAL_SHARPEN_SIGMA })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function resolveInputAsset(job: EditJob): Promise<PhotoAsset | null> {
  if (job.assetId) {
    const [asset] = await db
      .select()
      .from(photoAssets)
      .where(eq(photoAssets.id, job.assetId));
    return asset ?? null;
  }

  if (job.bracketGroupId) {
    const [group] = await db
      .select()
      .from(bracketGroups)
      .where(eq(bracketGroups.id, job.bracketGroupId));
    if (!group?.mergedAssetId) return null;
    const [asset] = await db
      .select()
      .from(photoAssets)
      .where(eq(photoAssets.id, group.mergedAssetId));
    return asset ?? null;
  }

  return null;
}

/**
 * Recover org id from a Firebase storage URL. Same heuristic as hdr-merge —
 * the signed URL path keeps the org segment after the `photo/` prefix.
 */
function inferOrgId(asset: PhotoAsset): string {
  const match =
    /\/photo%2F([^%]+)%2F/.exec(asset.sourceUrl) ??
    /\/photo\/([^/]+)\//.exec(asset.sourceUrl);
  return match?.[1] ?? "unknown";
}
