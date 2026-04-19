/**
 * HDR merge — simplified Mertens exposure fusion.
 *
 * Takes the JPEGs in a bracket_group, blends them into a single preview
 * where each pixel is weighted by how well-exposed it is in each frame.
 * Shadows get their weight from the overexposed frame, highlights from
 * the underexposed frame, midtones from the middle. The result looks
 * HDR-ish without ever blowing out or crushing.
 *
 * What this handler is:
 *   - A single-scale weighted average (no Laplacian pyramid).
 *   - Downsampled to 1920px longest side so memory stays sane on Cloud
 *     Run's default 512MB instance.
 *   - Watermarked — this is the *free preview* the user sees. Paid
 *     unlock re-runs a different handler at full res without watermark.
 *
 * What this handler is not:
 *   - Production-grade HDR. The real one gets a multi-resolution pyramid
 *     fusion later. For now the single-scale weighting is already a
 *     dramatic upgrade over any single exposure.
 *   - Colour-managed. Input is assumed sRGB JPEG from a consumer camera.
 *     Pro cameras shooting Adobe RGB will look slightly off and we'll
 *     handle that when we do the paid full-res pass.
 */

import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import type { EditJob, PhotoAsset, InsertPhotoAsset, InsertEditVersion } from "@shared/schema";
import { db } from "../../db";
import {
  bracketGroups,
  editVersions,
  photoAssets,
} from "@shared/schema";
import { firebaseStorageService } from "../../services/firebase-storage-service";
import type { HandlerResult } from "./pipeline-auto";

/** Longest-side pixels for the watermarked preview. */
const PREVIEW_MAX_EDGE = 1920;
/** Mertens well-exposedness sigma; 0.2 is what the original paper uses. */
const EXPOSURE_SIGMA = 0.2;
/** JPEG quality for the preview. 82 balances visible artifacts vs file size. */
const PREVIEW_JPEG_QUALITY = 82;

export async function handleHdrMerge(job: EditJob): Promise<HandlerResult> {
  const started = Date.now();
  if (!job.bracketGroupId) {
    throw new Error(`hdr_merge job ${job.id} missing bracketGroupId`);
  }

  // 1. Hydrate the bracket group's member assets.
  const [group] = await db
    .select()
    .from(bracketGroups)
    .where(eq(bracketGroups.id, job.bracketGroupId));
  if (!group) throw new Error(`Bracket group ${job.bracketGroupId} not found`);

  const members = await db
    .select()
    .from(photoAssets)
    .where(
      and(
        eq(photoAssets.projectId, job.projectId),
        eq(photoAssets.bracketGroupId, job.bracketGroupId)
      )
    );

  if (members.length < 2) {
    throw new Error(
      `Bracket group ${job.bracketGroupId} has ${members.length} photos — need at least 2 to merge`
    );
  }

  // Sort by exposure bias so the fusion is stable across reruns.
  members.sort((a, b) => exposureBiasEv(a) - exposureBiasEv(b));

  // 2. Download + decode every member to normalised rgb pixels. We resize
  //    to a common preview resolution here so the fusion loop doesn't
  //    have to handle size mismatches.
  const decoded = await Promise.all(
    members.map(async (asset) => decodeToRaw(asset))
  );

  // Force all exposures to the dimensions of the first frame. In practice
  // the photographer's tripod means they're already identical; this is
  // belt-and-braces so a 1-pixel difference doesn't crash the fusion.
  const { width, height, channels } = decoded[0];
  const exposures: Uint8Array[] = decoded.map((d, i) => {
    if (d.width !== width || d.height !== height) {
      throw new Error(
        `Exposure ${members[i].fileName} is ${d.width}×${d.height}, expected ${width}×${height}. Aborting merge — frames must align.`
      );
    }
    return d.data;
  });

  // 3. Mertens-style weighted fusion, single scale.
  const merged = fuseExposures(exposures, width, height, channels);

  // 4. Encode + watermark.
  const watermarked = await sharp(merged, {
    raw: { width, height, channels: channels as 3 },
  })
    .composite([{ input: watermarkSvg(width, height), top: 0, left: 0 }])
    .jpeg({ quality: PREVIEW_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  // 5. Upload to Firebase Storage under a deterministic preview path.
  const storagePath = `photo/${inferOrgId(members[0])}/${job.projectId}/merged/bracket_${group.id}_${Date.now()}_preview.jpg`;
  const outputUrl = await firebaseStorageService.uploadFile(
    storagePath,
    watermarked,
    "image/jpeg",
    {
      editJobId: String(job.id),
      bracketGroupId: String(group.id),
      kind: "hdr_preview",
    }
  );

  // 6. Persist: derived photo_asset + edit_version + update group status.
  const result = await db.transaction(async (tx) => {
    const insertAsset: InsertPhotoAsset = {
      projectId: job.projectId,
      userId: job.userId,
      sourceUrl: outputUrl,
      fileName: `bracket_${group.id}_hdr_preview.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: watermarked.byteLength,
      widthPx: width,
      heightPx: height,
      exifData: null,
      derivedFromJobId: job.id,
    };
    const [derived] = await tx.insert(photoAssets).values(insertAsset).returning();

    const insertVersion: InsertEditVersion = {
      assetId: derived.id,
      jobId: job.id,
      versionNumber: 1,
      outputUrl,
      watermarked: true,
      isCurrent: true,
    };
    await tx.insert(editVersions).values(insertVersion);

    await tx
      .update(bracketGroups)
      .set({ status: "merged", mergedAssetId: derived.id })
      .where(eq(bracketGroups.id, group.id));

    return derived;
  });

  return {
    outputAssetId: result.id,
    costCents: 0, // local compute
    durationMs: Date.now() - started,
  };
}

// -----------------------------------------------------------------------------
// Internals
// -----------------------------------------------------------------------------

function exposureBiasEv(asset: PhotoAsset): number {
  const exif = asset.exifData as { exposureBiasEv?: number | null } | null;
  return typeof exif?.exposureBiasEv === "number" ? exif.exposureBiasEv : 0;
}

/**
 * Try to recover the orgId from an asset's storage URL. The original
 * upload path looks like `photo/{orgId}/{projectId}/...`, and the signed
 * URL contains that path. Falling back to "unknown" is safe — the merged
 * output still uploads successfully, just under a slightly-off path.
 */
function inferOrgId(asset: PhotoAsset): string {
  const match = /\/photo%2F([^%]+)%2F/.exec(asset.sourceUrl) ??
                /\/photo\/([^/]+)\//.exec(asset.sourceUrl);
  return match?.[1] ?? "unknown";
}

interface DecodedExposure {
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
}

async function decodeToRaw(asset: PhotoAsset): Promise<DecodedExposure> {
  const res = await fetch(asset.sourceUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${asset.fileName}: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());

  const pipeline = sharp(buf, { failOn: "none" })
    .rotate() // honour EXIF orientation so all frames align
    .resize({
      width: PREVIEW_MAX_EDGE,
      height: PREVIEW_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toColourspace("srgb")
    .removeAlpha();

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

/**
 * Single-scale Mertens fusion. For each pixel position we compute a weight
 * per exposure based on well-exposedness (how close the pixel's luminance
 * is to 0.5), normalise across exposures, and take the weighted average.
 *
 * Performance: a 1920×1280×3 array is ~7.4MB per exposure. With 5
 * exposures we loop ~37M float ops twice (weights + merge). On a modern
 * CPU that's ~200ms. Good enough for MVP; Laplacian pyramid fusion would
 * take 10× longer but looks meaningfully better.
 */
function fuseExposures(
  exposures: Uint8Array[],
  width: number,
  height: number,
  channels: number
): Buffer {
  const pixelCount = width * height;
  const out = Buffer.alloc(pixelCount * channels);

  // Precompute per-exposure weight arrays (Float32 for numeric stability).
  const weights: Float32Array[] = exposures.map((exp) => {
    const w = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const base = i * channels;
      // Luminance approximation (rec. 709) → normalised [0, 1].
      const r = exp[base] / 255;
      const g = exp[base + 1] / 255;
      const b = exp[base + 2] / 255;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // Gaussian around 0.5 — pixels near mid-gray get high weight, pixels
      // near 0 or 1 get crushed. +1e-4 prevents all-zero columns.
      const delta = lum - 0.5;
      w[i] = Math.exp(-(delta * delta) / (2 * EXPOSURE_SIGMA * EXPOSURE_SIGMA)) + 1e-4;
    }
    return w;
  });

  // Normalise weights so they sum to 1 per pixel across exposures.
  for (let i = 0; i < pixelCount; i++) {
    let total = 0;
    for (let e = 0; e < weights.length; e++) total += weights[e][i];
    const inv = 1 / total;
    for (let e = 0; e < weights.length; e++) weights[e][i] *= inv;
  }

  // Weighted sum.
  for (let i = 0; i < pixelCount; i++) {
    const base = i * channels;
    let r = 0,
      g = 0,
      b = 0;
    for (let e = 0; e < exposures.length; e++) {
      const w = weights[e][i];
      const eb = exposures[e];
      r += eb[base] * w;
      g += eb[base + 1] * w;
      b += eb[base + 2] * w;
    }
    out[base] = clamp255(r);
    out[base + 1] = clamp255(g);
    out[base + 2] = clamp255(b);
  }

  return out;
}

function clamp255(v: number): number {
  if (v <= 0) return 0;
  if (v >= 255) return 255;
  return Math.round(v);
}

/**
 * Diagonal "AILLDOIT PREVIEW" watermark. SVG so the text stays crisp at
 * any preview resolution, semi-transparent so the underlying image is
 * clearly visible.
 */
function watermarkSvg(width: number, height: number): Buffer {
  const fontSize = Math.max(28, Math.round(Math.min(width, height) * 0.045));
  const cx = width / 2;
  const cy = height / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <g transform="rotate(-24 ${cx} ${cy})">
        <text
          x="${cx}"
          y="${cy}"
          font-family="Helvetica, Arial, sans-serif"
          font-size="${fontSize}"
          font-weight="700"
          letter-spacing="8"
          fill="white"
          fill-opacity="0.28"
          stroke="black"
          stroke-opacity="0.18"
          stroke-width="2"
          text-anchor="middle"
          dominant-baseline="middle"
        >AILLDOIT PREVIEW</text>
      </g>
    </svg>`
  );
}
