/**
 * sky_replace handler — segment the sky region and composite a cleaner one.
 *
 * This is an ML-only operation for MVP. Gray/blown-out skies are the single
 * most common "fix-this" ask on real-estate shots — a blue or softly clouded
 * sky lifts a photo from "overcast listing" to "perfect open house."
 *
 * Why ML-only
 *  - Reliable sky segmentation requires a learned model (Replicate sky
 *    segmentation + SDXL compositing, or a purpose-built real-estate sky
 *    model). A CPU approximation (HSL threshold on the upper portion of the
 *    image) would miss tree lines, rooflines, and reflections — the failures
 *    would look worse than no correction at all. Better to wait on the model
 *    bakeoff than ship a handler that regresses quality.
 *
 * Behaviour
 *  - Calls the provider with `model: "sky-replace"`.
 *  - If `MODEL_REGISTRY["sky-replace"]` is still `null`
 *    (i.e., not yet pinned), the provider throws
 *    `ProviderUnavailableError`. We re-throw so `pipeline_auto` marks the
 *    step as best-effort-failed and keeps the previous rendition intact.
 *
 * Inputs it accepts (via job.inputParams, all optional)
 *  - `sky_preset`: 'clear' | 'dramatic' | 'sunset' | 'golden'
 *    — sent verbatim to the provider; the model maps preset → reference sky.
 *  - `strength`: float 0..1 — how strongly the new sky is composited.
 *
 * When a good model is pinned, ~zero code changes here — we just update
 * `MODEL_REGISTRY` and the handler starts working.
 */

import type { EditJob } from "@shared/schema";
import type { HandlerResult } from "./pipeline-auto";
import { getPhotoModelProvider } from "../../services/photo-providers";
import { runSingleAssetCorrection } from "./correction-common";

export async function handleSkyReplace(job: EditJob): Promise<HandlerResult> {
  return runSingleAssetCorrection(job, {
    stage: "sky_replace",
    bracketStatus: "sky_replaced",
    produce: async ({ inputAsset }) => {
      const provider = getPhotoModelProvider();
      // Let ProviderUnavailableError bubble — pipeline_auto catches and
      // records the step as failed without touching the chain.
      const result = await provider.run({
        imageUrls: [inputAsset.sourceUrl],
        model: "sky-replace",
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
    },
  });
}
