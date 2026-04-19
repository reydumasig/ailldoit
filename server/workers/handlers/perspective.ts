/**
 * perspective handler — vertical/keystone correction.
 *
 * Real-estate photos shot with the camera tilted up (to fit a ceiling) show
 * verticals converging toward the top. Correcting those "leaning walls" is
 * one of the core editorial passes — it's what separates MLS-ready photos
 * from amateur shots.
 *
 * MVP behaviour (two modes):
 *
 *   1. **Auto-straighten** — if we have EXIF rotation data indicating a
 *      level-gyro angle, apply that rotation. The vast majority of modern
 *      cameras bake orientation metadata; `.rotate()` (no args) respects it.
 *      We keep this as the default path so pipeline_auto can run it
 *      safely without user input.
 *
 *   2. **Manual correction** — if `job.inputParams` contains any of
 *      `rotate`, `shearY`, or `shearX`, apply them via Sharp's `.affine()`
 *      transform. This supports future UI where the reviewer drags a
 *      slider on the QC workflow (Phase 1.5).
 *
 * What's NOT here yet
 *  - Auto-detection of leaning verticals from the pixel data. That
 *    requires edge/Hough-line analysis which we'd get cheapest via
 *    `@techstark/opencv-js` (~30MB wasm). Deferred to a follow-up — not a
 *    blocker for MVP launch because most phone-shot photos are already
 *    reasonably level, and the Phase 1.5 QC UI lets editors correct by
 *    hand.
 *
 *  - ML keystone (e.g. a Replicate perspective model). We try the provider
 *    path first so if/when a good model lands we flip a registry entry
 *    and it takes over without a handler rewrite.
 *
 * The handler always emits a new version row — even if the correction is
 * a noop — so the pipeline's invariant ("each step bumps the chain") holds.
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

/**
 * Shape of inputParams we honour. All fields optional; omitted means noop.
 *   - rotate:  degrees, positive = clockwise, roughly ±10° range
 *   - shearY:  vertical keystone, range roughly ±0.2 (higher = more correction)
 *   - shearX:  horizontal keystone, seldom useful for real-estate but exposed
 *     for symmetry.
 */
interface PerspectiveParams {
  rotate?: number;
  shearY?: number;
  shearX?: number;
}

/** Bounds beyond which we suspect bad input and clamp so we can't destroy the image. */
const MAX_ROTATE_DEG = 15;
const MAX_SHEAR = 0.3;

export async function handlePerspective(job: EditJob): Promise<HandlerResult> {
  return runSingleAssetCorrection(job, {
    stage: "perspective",
    bracketStatus: "straightened",
    produce: async ({ inputAsset }) => {
      // Try provider path (will be the winner once we pin a model).
      const provider = getPhotoModelProvider();
      try {
        const result = await provider.run({
          imageUrls: [inputAsset.sourceUrl],
          model: "perspective",
          editJobId: job.id,
          projectId: job.projectId,
          params: (job.inputParams as Record<string, unknown> | undefined) ?? undefined,
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
          `📐 PERSPECTIVE: provider unavailable (${err.message}) — using Sharp affine fallback`
        );
      }

      const params = sanitizeParams(
        (job.inputParams as PerspectiveParams | null | undefined) ?? {}
      );
      const outputBuffer = await applyPerspective(inputAsset.sourceUrl, params);
      return {
        outputBuffer,
        costCents: 0,
        providerMeta: { provider: "local-sharp-affine", params },
      };
    },
  });
}

function sanitizeParams(raw: PerspectiveParams): PerspectiveParams {
  return {
    rotate: clamp(raw.rotate ?? 0, -MAX_ROTATE_DEG, MAX_ROTATE_DEG),
    shearY: clamp(raw.shearY ?? 0, -MAX_SHEAR, MAX_SHEAR),
    shearX: clamp(raw.shearX ?? 0, -MAX_SHEAR, MAX_SHEAR),
  };
}

/**
 * Apply rotation + shear via Sharp's affine transform. The matrix is:
 *
 *   [ a b ]   [ cos(θ)  -shearX ]
 *   [ c d ] = [ shearY   cos(θ) ]  (plus sin/cos for rotation)
 *
 * Pure noop (all zeros) still re-encodes so the DB state stays consistent
 * with the version chain invariant.
 */
async function applyPerspective(
  sourceUrl: string,
  params: PerspectiveParams
): Promise<Buffer> {
  const src = await fetchAssetBuffer(sourceUrl);

  // Respect EXIF orientation first. Without this Sharp would bake the
  // orientation flag but our affine math would then operate on the
  // "wrong" grid.
  let pipeline = sharp(src, { failOn: "none" }).rotate();

  const { rotate = 0, shearY = 0, shearX = 0 } = params;

  if (rotate !== 0 || shearY !== 0 || shearX !== 0) {
    const rad = (rotate * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Affine: [[a, b], [c, d]] — rotation composed with shear. Sharp
    // multiplies pixel coords by this matrix, so positive shearY slopes
    // verticals inward, which is the keystone correction direction.
    const matrix: [number, number, number, number] = [
      cos,
      -sin + shearX,
      sin + shearY,
      cos,
    ];

    pipeline = pipeline.affine(matrix, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      interpolator: "bilinear" as any, // Sharp accepts string literal at runtime
    });
  }

  return pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(hi, Math.max(lo, n));
}
