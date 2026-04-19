/**
 * Shared plumbing for single-asset "correction" handlers (white balance,
 * perspective, window pull, sky replace). Every one of these follows the
 * same shape:
 *
 *   1. Resolve the input asset (explicit assetId, or the bracket's current
 *      merged rendition).
 *   2. Produce an output buffer — either from the provider, or from a
 *      CPU fallback when the provider is unavailable.
 *   3. Upload the buffer under a deterministic Firebase path.
 *   4. Insert a new derived photo_asset + edit_versions row, bumping
 *      versionNumber and flipping isCurrent in the same transaction.
 *   5. If the job targets a bracket, point bracketGroups.mergedAssetId at
 *      the new rendition so the detail page tracks the latest version.
 *
 * Only steps (2) differs per handler — that's the "produce" callback below.
 * All other steps are boilerplate that must stay consistent (version chain
 * integrity, bracket pointer hygiene) so we DRY them here once.
 *
 * This helper is NOT for multi-input handlers (HDR merge consumes N source
 * exposures). Those own their own orchestration.
 */

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
import type { HandlerResult } from "./pipeline-auto";
import { renderDualOutput } from "./watermark";

/**
 * What a handler must produce given the input. Either a buffer of the
 * modified JPEG bytes + optional cost/metadata (from the model provider),
 * or a buffer + the local-fallback cost (0 cents).
 */
export interface CorrectionOutput {
  outputBuffer: Buffer;
  costCents?: number;
  providerMeta?: Record<string, unknown>;
}

export interface CorrectionContext {
  inputAsset: PhotoAsset;
  job: EditJob;
}

export interface RunCorrectionOptions {
  /** Used for the storage path segment + filename (e.g. 'white_balance'). */
  stage: string;
  /**
   * Produces the output buffer. Receives the already-resolved input asset
   * and the original job so handlers don't need to re-query.
   */
  produce: (ctx: CorrectionContext) => Promise<CorrectionOutput>;
  /**
   * Optional status to stamp on the bracket group when the corrected
   * rendition becomes the current one. Defaults to the existing status
   * so we don't flip a group to the wrong phase.
   */
  bracketStatus?: string;
}

/**
 * Execute a single-asset correction handler. Returns a HandlerResult the
 * worker can persist directly onto the edit_jobs row.
 */
export async function runSingleAssetCorrection(
  job: EditJob,
  opts: RunCorrectionOptions
): Promise<HandlerResult> {
  const started = Date.now();

  const inputAsset = await resolveInputAsset(job);
  if (!inputAsset) {
    throw new Error(
      `${opts.stage} job ${job.id}: could not resolve an input asset (assetId=${job.assetId ?? "-"}, bracketGroupId=${job.bracketGroupId ?? "-"})`
    );
  }

  // 2. Produce the clean buffer from the handler's produce() callback.
  //    Every caller (correction handlers, enhance) returns unwatermarked
  //    bytes here — we do the watermarking uniformly below.
  const produced = await opts.produce({ inputAsset, job });
  const costCents = produced.costCents ?? 0;
  const providerMeta = produced.providerMeta ?? { provider: "local-fallback" };

  // 3. Fork into clean + watermarked JPEGs. The clean one backs the paid
  //    unlock-download; the watermarked one is the free preview. Both
  //    upload in parallel so latency is ~max(upload_clean, upload_wm)
  //    rather than sum.
  const dual = await renderDualOutput(produced.outputBuffer);

  const baseDir = `photo/${inferOrgId(inputAsset)}/${job.projectId}/${opts.stage}`;
  const stamp = Date.now();
  const previewPath = `${baseDir}/asset_${inputAsset.id}_${stamp}_preview.jpg`;
  const cleanPath = `${baseDir}/asset_${inputAsset.id}_${stamp}_clean.jpg`;

  const [outputUrl, cleanOutputUrl] = await Promise.all([
    firebaseStorageService.uploadFile(previewPath, dual.watermarked, "image/jpeg", {
      editJobId: String(job.id),
      sourceAssetId: String(inputAsset.id),
      kind: `${opts.stage}_preview`,
    }),
    firebaseStorageService.uploadFile(cleanPath, dual.clean, "image/jpeg", {
      editJobId: String(job.id),
      sourceAssetId: String(inputAsset.id),
      kind: `${opts.stage}_clean`,
    }),
  ]);

  // 4. Version + asset insert, atomically with demotion of the previous
  //    current version.
  const result = await db.transaction(async (tx) => {
    const insertAsset: InsertPhotoAsset = {
      projectId: job.projectId,
      userId: job.userId,
      sourceUrl: outputUrl, // asset sourceUrl tracks the preview (UI default)
      fileName: `asset_${inputAsset.id}_${opts.stage}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: dual.watermarked.byteLength,
      widthPx: dual.width,
      heightPx: dual.height,
      exifData: null,
      derivedFromJobId: job.id,
    };
    const [derived] = await tx.insert(photoAssets).values(insertAsset).returning();

    // editVersions keys on the INPUT asset's id — all renditions of the
    // same source sit in one version chain. That way the UI shows a
    // coherent "history" per source image regardless of how many steps
    // the pipeline ran.
    const [prev] = await tx
      .select()
      .from(editVersions)
      .where(eq(editVersions.assetId, inputAsset.id))
      .orderBy(desc(editVersions.versionNumber))
      .limit(1);

    const nextVersion = (prev?.versionNumber ?? 0) + 1;

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
      cleanOutputUrl,
      watermarked: true,
      isCurrent: true,
    };
    await tx.insert(editVersions).values(insertVersion);

    if (job.bracketGroupId) {
      const patch: Partial<{ mergedAssetId: number; status: string }> = {
        mergedAssetId: derived.id,
      };
      if (opts.bracketStatus) patch.status = opts.bracketStatus;
      await tx
        .update(bracketGroups)
        .set(patch)
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (shared with enhance.ts — identical behaviour)
// ─────────────────────────────────────────────────────────────────────────────

export async function resolveInputAsset(
  job: EditJob
): Promise<PhotoAsset | null> {
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
 * Recover org id from the asset's Firebase URL so we can group storage
 * under `photo/{orgId}/…`. Same heuristic as the legacy handlers — the
 * URL path keeps the org segment right after the `photo/` prefix.
 */
export function inferOrgId(asset: PhotoAsset): string {
  const match =
    /\/photo%2F([^%]+)%2F/.exec(asset.sourceUrl) ??
    /\/photo\/([^/]+)\//.exec(asset.sourceUrl);
  return match?.[1] ?? "unknown";
}

/**
 * Utility to download an asset's current bytes. Used by CPU fallbacks
 * that need to manipulate the image in Node.
 */
export async function fetchAssetBuffer(sourceUrl: string): Promise<Buffer> {
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch asset (${res.status} ${res.statusText}): ${sourceUrl}`
    );
  }
  return Buffer.from(await res.arrayBuffer());
}
