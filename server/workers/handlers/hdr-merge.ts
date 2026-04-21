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
import * as jpegJs from "jpeg-js";
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
import { cleanFromRaw, watermarkFromRaw } from "./watermark";

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
  console.log(`🎞️  HDR_MERGE: hydrated bracket=${group.id} status=${group.status}`);

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
  console.log(
    `🎞️  HDR_MERGE: ${members.length} members → ${members.map((m) => m.fileName).join(", ")}`
  );

  // Sort by exposure bias so the fusion is stable across reruns.
  members.sort((a, b) => exposureBiasEv(a) - exposureBiasEv(b));

  // 2. Download + decode every member to normalised rgb pixels. We resize
  //    to a common preview resolution here so the fusion loop doesn't
  //    have to handle size mismatches.
  //    Decode sequentially rather than in parallel so a failure names the
  //    offending file instead of throwing generically from Promise.all.
  const decoded: DecodedExposure[] = [];
  for (const asset of members) {
    try {
      const d = await decodeToRaw(asset);
      console.log(
        `🎞️  HDR_MERGE: decoded ${asset.fileName} → ${d.width}×${d.height}×${d.channels}`
      );
      decoded.push(d);
    } catch (err: any) {
      throw new Error(
        `decodeToRaw failed for ${asset.fileName} (${asset.sourceUrl}): ${err?.message ?? err}`
      );
    }
  }

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
  console.log(
    `🎞️  HDR_MERGE: fusing ${exposures.length} exposures @ ${width}×${height}×${channels}`
  );
  const merged = fuseExposures(exposures, width, height, channels);

  // Safety net: Sharp's `raw` input requires channels to be 1..4. If
  // `removeAlpha()` ever returns an unexpected channel count we want a
  // legible error, not an opaque "expected boolean" from libvips.
  if (channels !== 3 && channels !== 4) {
    throw new Error(
      `HDR fusion produced ${channels}-channel buffer — expected 3 or 4. Cannot encode.`
    );
  }

  // 4. Encode both a clean and a watermarked JPEG from the same raw
  //    fusion buffer. Clean = paid unlock-download, watermarked = free
  //    preview. Done sequentially to isolate encode failures.
  let cleanBuffer: Buffer;
  let watermarkedBuffer: Buffer;
  try {
    cleanBuffer = await cleanFromRaw(merged, width, height, channels as 3, {
      jpegQuality: PREVIEW_JPEG_QUALITY,
    });
    console.log(`🎞️  HDR_MERGE: clean encode ok (${cleanBuffer.byteLength} bytes)`);
  } catch (err: any) {
    throw new Error(`cleanFromRaw failed: ${err?.message ?? err}`);
  }
  try {
    watermarkedBuffer = await watermarkFromRaw(
      merged,
      width,
      height,
      channels as 3,
      { jpegQuality: PREVIEW_JPEG_QUALITY }
    );
    console.log(
      `🎞️  HDR_MERGE: watermark encode ok (${watermarkedBuffer.byteLength} bytes)`
    );
  } catch (err: any) {
    throw new Error(`watermarkFromRaw failed: ${err?.message ?? err}`);
  }

  // 5. Upload both to Firebase Storage under deterministic paths.
  const baseDir = `photo/${inferOrgId(members[0])}/${job.projectId}/merged`;
  const stamp = Date.now();
  const previewPath = `${baseDir}/bracket_${group.id}_${stamp}_preview.jpg`;
  const cleanPath = `${baseDir}/bracket_${group.id}_${stamp}_clean.jpg`;

  let outputUrl: string;
  let cleanOutputUrl: string;
  try {
    outputUrl = await firebaseStorageService.uploadFile(
      previewPath,
      watermarkedBuffer,
      "image/jpeg",
      {
        editJobId: String(job.id),
        bracketGroupId: String(group.id),
        kind: "hdr_preview",
      }
    );
    console.log(`🎞️  HDR_MERGE: preview uploaded → ${previewPath}`);
  } catch (err: any) {
    throw new Error(`preview upload failed (${previewPath}): ${err?.message ?? err}`);
  }
  try {
    cleanOutputUrl = await firebaseStorageService.uploadFile(
      cleanPath,
      cleanBuffer,
      "image/jpeg",
      {
        editJobId: String(job.id),
        bracketGroupId: String(group.id),
        kind: "hdr_clean",
      }
    );
    console.log(`🎞️  HDR_MERGE: clean uploaded → ${cleanPath}`);
  } catch (err: any) {
    throw new Error(`clean upload failed (${cleanPath}): ${err?.message ?? err}`);
  }

  // 6. Persist: derived photo_asset + edit_version + update group status.
  const result = await db.transaction(async (tx) => {
    const insertAsset: InsertPhotoAsset = {
      projectId: job.projectId,
      userId: job.userId,
      sourceUrl: outputUrl,
      fileName: `bracket_${group.id}_hdr_preview.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: watermarkedBuffer.byteLength,
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
      cleanOutputUrl,
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

/**
 * Decode a single exposure to a raw RGB pixel buffer, sized to the preview
 * edge.
 *
 * Sharp is lazy: chained ops don't execute until a terminal call
 * (.toBuffer/.toFile). That means a try/catch around each chained op only
 * catches synchronous setup errors — the real libvips errors surface on
 * the terminal call, which makes localisation hard.
 *
 * So we split the work into TWO materialisations:
 *   Stage A: open → rotate (EXIF) → re-encode to a clean JPEG buffer.
 *            This forces libvips to evaluate rotate() and bakes in
 *            orientation. It also strips ICC profiles, EXIF tags, and any
 *            other metadata that can trip libvips during the render pass.
 *   Stage B: open the clean JPEG → resize → raw().toBuffer().
 *            Pure pixel work on a scrubbed buffer, no metadata to
 *            mis-handle.
 *
 * Known Canon CR3 preview failure mode (reason this module exists):
 *   "A boolean was expected" from libvips during the render pass. The
 *   metadata probe looks perfectly clean (sRGB / 3-channel / no alpha),
 *   but something in the extracted preview — embedded ICC profile or a
 *   malformed EXIF orientation tag — makes one of the queued ops blow up
 *   at evaluation time. Splitting into stages + stripping metadata via
 *   an intermediate re-encode makes the full decode work.
 */
async function decodeToRaw(asset: PhotoAsset): Promise<DecodedExposure> {
  const res = await fetch(asset.sourceUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${asset.fileName}: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());

  // Probe first so we know what we're dealing with and can log it.
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buf, { failOn: "none" }).metadata();
  } catch (err: any) {
    throw new Error(
      `sharp.metadata threw for ${asset.fileName}: ${err?.message ?? err}`
    );
  }
  const hasAlpha = meta.hasAlpha === true;
  const space = meta.space ?? "unknown";
  const hasIcc = Boolean(meta.icc);
  console.log(
    `🎞️  HDR_MERGE: probe ${asset.fileName} → ${meta.format} ${meta.width}×${meta.height} space=${space} alpha=${hasAlpha} channels=${meta.channels} icc=${hasIcc} orientation=${meta.orientation ?? "none"}`
  );

  // ---------------------------------------------------------------------
  // Stage A: rotate + re-encode to a clean, metadata-stripped JPEG.
  // ---------------------------------------------------------------------
  // `.jpeg().toBuffer()` forces libvips to evaluate .rotate() right here,
  // so if orientation handling is the thing that throws, it throws at
  // Stage A and we know to skip it.
  //
  // If Stage A throws "A boolean was expected" (or anything else), we
  // assume libvips can't decode the pixel stream of this buffer and
  // fall back to the pure-JS `jpeg-js` decoder. jpeg-js is more permissive
  // than libjpeg-turbo and tends to succeed on the slightly-truncated
  // JPEGs our CR3 byte-scanner extracts.
  let cleanJpeg: Buffer | null = null;
  let stageAErr: string | null = null;
  try {
    cleanJpeg = await sharp(buf, { failOn: "none" })
      .rotate() // honour EXIF orientation; then we throw the tag away
      .jpeg({ quality: 95, mozjpeg: false })
      .toBuffer();
  } catch (rotateErr: any) {
    // Retry without rotate(). Most of the bracket will be shot on a tripod
    // at the same orientation anyway, so dropping orientation won't
    // misalign frames in practice.
    console.warn(
      `⚠️ HDR_MERGE: rotate+encode threw for ${asset.fileName} (${rotateErr?.message ?? rotateErr}) — retrying without rotate()`
    );
    try {
      cleanJpeg = await sharp(buf, { failOn: "none" })
        .jpeg({ quality: 95, mozjpeg: false })
        .toBuffer();
    } catch (plainErr: any) {
      // Both Sharp paths failed. Record the reason and drop through to the
      // jpeg-js fallback below.
      stageAErr = `rotate err: ${rotateErr?.message ?? rotateErr}; plain err: ${plainErr?.message ?? plainErr}`;
      console.warn(
        `⚠️ HDR_MERGE: Stage A Sharp decode failed for ${asset.fileName} (${stageAErr}) — falling back to jpeg-js pure-JS decoder`
      );
    }
  }

  // ---------------------------------------------------------------------
  // Stage B: produce the final raw RGB pixel buffer sized to preview.
  // ---------------------------------------------------------------------
  let raw: { data: Buffer; info: sharp.OutputInfo };

  if (cleanJpeg) {
    // Happy path: Sharp gave us a clean JPEG, resize + raw from there.
    try {
      raw = await sharp(cleanJpeg, { failOn: "none" })
        .resize({
          width: PREVIEW_MAX_EDGE,
          height: PREVIEW_MAX_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    } catch (resizeErr: any) {
      // Try once more without removeAlpha.
      try {
        raw = await sharp(cleanJpeg, { failOn: "none" })
          .resize({
            width: PREVIEW_MAX_EDGE,
            height: PREVIEW_MAX_EDGE,
            fit: "inside",
            withoutEnlargement: true,
          })
          .raw()
          .toBuffer({ resolveWithObject: true });
      } catch (bareErr: any) {
        // Sharp can't resize the clean JPEG either — drop to jpeg-js on
        // the original buffer (not the re-encoded one).
        console.warn(
          `⚠️ HDR_MERGE: Stage B Sharp resize failed for ${asset.fileName} (with removeAlpha: ${resizeErr?.message ?? resizeErr}; without: ${bareErr?.message ?? bareErr}) — falling back to jpeg-js`
        );
        raw = await decodeViaJpegJs(buf, asset.fileName);
      }
    }
  } else {
    // Sharp couldn't touch this buffer at all. Try jpeg-js instead.
    raw = await decodeViaJpegJs(buf, asset.fileName);
  }

  // Defence in depth: the fusion loop assumes exactly 3 channels. If
  // removeAlpha was skipped and the source was 4-channel, drop the alpha
  // byte here in JS so the downstream code doesn't have to branch.
  if (raw.info.channels === 4) {
    console.warn(
      `⚠️ HDR_MERGE: ${asset.fileName} emerged as 4-channel raw; dropping alpha in JS`
    );
    const px = raw.info.width * raw.info.height;
    const rgb = Buffer.alloc(px * 3);
    for (let i = 0; i < px; i++) {
      rgb[i * 3] = raw.data[i * 4];
      rgb[i * 3 + 1] = raw.data[i * 4 + 1];
      rgb[i * 3 + 2] = raw.data[i * 4 + 2];
    }
    return {
      data: new Uint8Array(rgb),
      width: raw.info.width,
      height: raw.info.height,
      channels: 3,
    };
  }

  return {
    data: new Uint8Array(raw.data),
    width: raw.info.width,
    height: raw.info.height,
    channels: raw.info.channels,
  };
}

/**
 * Fallback decoder for JPEGs libvips can't parse.
 *
 * `jpeg-js` is a pure-JS JPEG decoder. It's ~20× slower than libjpeg-turbo
 * but much more permissive — it happily decodes JPEGs with slightly-off
 * EOI markers, unusual DCT coefficient patterns, or mildly-truncated
 * streams that cause libvips to throw "A boolean was expected" (the
 * generic gvalue error libvips surfaces when native decode trips).
 *
 * This is the path we hit for most Canon CR3 embedded previews — our
 * byte-scanner in photo-asset-service.ts extracts a JPEG whose header
 * parses fine (so `sharp.metadata()` succeeds at upload-time validation)
 * but whose pixel stream libvips rejects at decode-time.
 *
 * Flow:
 *   1. jpeg-js → Uint8Array RGBA at full source resolution.
 *   2. Sharp, opened as raw RGBA, resized + removeAlpha + raw.toBuffer.
 *      We still use Sharp for the resize because it's the fastest way
 *      to get a high-quality downsample.
 */
async function decodeViaJpegJs(
  buf: Buffer,
  fileName: string
): Promise<{ data: Buffer; info: sharp.OutputInfo }> {
  let decoded: { data: Uint8Array; width: number; height: number };
  try {
    decoded = jpegJs.decode(buf, {
      useTArray: true,
      formatAsRGBA: true,
      // tolerantDecoding lets jpeg-js return whatever it could decode even
      // if EOF comes mid-scan. For our preview use-case that's strictly
      // better than failing.
      tolerantDecoding: true,
      maxMemoryUsageInMB: 1024,
      maxResolutionInMP: 200,
    });
  } catch (err: any) {
    throw new Error(
      `jpeg-js fallback decode failed for ${fileName}: ${err?.message ?? err}`
    );
  }
  console.log(
    `🎞️  HDR_MERGE: jpeg-js decoded ${fileName} → ${decoded.width}×${decoded.height} RGBA`
  );

  // Feed the raw RGBA pixels into Sharp for a high-quality resize down to
  // preview edge. Sharp handles raw input fine; the "boolean" bug is in
  // the JPEG decoder path, not the resize path.
  try {
    return await sharp(Buffer.from(decoded.data), {
      raw: {
        width: decoded.width,
        height: decoded.height,
        channels: 4,
      },
    })
      .resize({
        width: PREVIEW_MAX_EDGE,
        height: PREVIEW_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch (err: any) {
    throw new Error(
      `Sharp resize of jpeg-js raw pixels failed for ${fileName}: ${err?.message ?? err}`
    );
  }
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

// Watermark SVG + composite helpers live in ./watermark.ts now, shared
// across every handler that emits preview renditions.
