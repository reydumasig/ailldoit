/**
 * white_balance handler — remove colour cast from interior and exterior
 * real-estate shots.
 *
 * Why this matters in real-estate: mixed lighting (tungsten lamps + daylight
 * through windows + LED downlights) gives photos a yellow-orange cast that
 * reads as "cheap" to buyers. Listings that look neutral-white feel more
 * professional. This is often the single biggest perceived-quality lift.
 *
 * Strategy
 *  - Try the provider (`white-balance` logical model) first. When we pin a
 *    Replicate colour-constancy model this path will win — ML models handle
 *    mixed-lighting scenes better than global-average methods.
 *  - Fall back to gray-world on ProviderUnavailableError. Gray-world assumes
 *    the average colour of a scene is neutral gray; it computes per-channel
 *    means and scales each channel so they converge. Fast, deterministic,
 *    works well for single-cast scenes (all tungsten, all daylight) but
 *    underperforms on mixed lighting — which is why the provider path
 *    exists.
 *
 * Math on the gray-world step
 *  - Let μR, μG, μB be the mean of each channel across the image.
 *  - Let μ = (μR + μG + μB) / 3.
 *  - Scale R by μ/μR, G by μ/μG, B by μ/μB. The three channels then all
 *    average to μ — the cast is gone.
 *  - We clamp the scale to [0.5, 2.0] so over-corrected shots don't
 *    introduce weird magenta/green casts on already-neutral photos.
 */

import sharp from "sharp";
import type { EditJob } from "@shared/schema";
import type { HandlerResult } from "./pipeline-auto";
import {
  getPhotoModelProvider,
  ProviderUnavailableError,
} from "../../services/photo-providers";
import {
  fetchAssetBuffer,
  runSingleAssetCorrection,
} from "./correction-common";

/** Bounds on per-channel gain so we can't turn a neutral image magenta. */
const MIN_GAIN = 0.5;
const MAX_GAIN = 2.0;

export async function handleWhiteBalance(job: EditJob): Promise<HandlerResult> {
  return runSingleAssetCorrection(job, {
    stage: "white_balance",
    bracketStatus: "balanced",
    produce: async ({ inputAsset }) => {
      const provider = getPhotoModelProvider();

      // Try the provider path first. Any ProviderUnavailableError falls
      // through to CPU gray-world — every other error escalates.
      try {
        const result = await provider.run({
          imageUrls: [inputAsset.sourceUrl],
          model: "white-balance",
          editJobId: job.id,
          projectId: job.projectId,
        });
        const res = await fetch(result.outputUrl);
        if (!res.ok) {
          throw new Error(
            `Failed to fetch provider output: ${res.status} ${res.statusText}`
          );
        }
        return {
          outputBuffer: Buffer.from(await res.arrayBuffer()),
          costCents: result.costCents,
          providerMeta: { ...(result.providerMeta ?? {}), fallback: false },
        };
      } catch (err) {
        if (!(err instanceof ProviderUnavailableError)) throw err;
        console.log(
          `🎨 WHITE_BALANCE: provider unavailable (${err.message}) — using gray-world fallback`
        );
      }

      const outputBuffer = await grayWorldBalance(inputAsset.sourceUrl);
      return {
        outputBuffer,
        costCents: 0,
        providerMeta: { provider: "local-gray-world" },
      };
    },
  });
}

/**
 * Apply gray-world white balance to a JPEG URL. Returns a mozjpeg-encoded
 * buffer ready to upload. Uses Sharp's channel stats + `.linear()` for the
 * per-channel scale.
 */
async function grayWorldBalance(sourceUrl: string): Promise<Buffer> {
  const src = await fetchAssetBuffer(sourceUrl);

  // `.stats()` returns per-channel mean, min, max, stdev. We use mean.
  const stats = await sharp(src, { failOn: "none" }).stats();
  const channels = stats.channels;
  if (!channels || channels.length < 3) {
    // Grayscale or unsupported — return bytes unchanged so downstream
    // handlers keep working. Still bumps the version (a rotation-honouring
    // re-encode) so the DB state stays consistent.
    return sharp(src, { failOn: "none" })
      .rotate()
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  }

  const [rMean, gMean, bMean] = channels.slice(0, 3).map((c) => c.mean);
  const overall = (rMean + gMean + bMean) / 3;

  const gainR = clamp(overall / rMean, MIN_GAIN, MAX_GAIN);
  const gainG = clamp(overall / gMean, MIN_GAIN, MAX_GAIN);
  const gainB = clamp(overall / bMean, MIN_GAIN, MAX_GAIN);

  // `.linear(a, b)` computes `a * pixel + b`. Per-channel arrays apply
  // the scale to each RGB channel independently, which is exactly the
  // gray-world transform.
  return sharp(src, { failOn: "none" })
    .rotate()
    .linear([gainR, gainG, gainB], [0, 0, 0])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(hi, Math.max(lo, n));
}
