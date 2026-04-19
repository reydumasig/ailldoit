/**
 * window_pull handler — recover highlight detail in blown-out windows.
 *
 * In interior real-estate shots, the bright exterior visible through
 * windows is 8–12 stops brighter than the room. Even with HDR bracketing,
 * windows can end up clipped to pure white — especially on single-frame
 * shots. "Window pull" is the editorial pass that brings the view back:
 * segmenting the window region, reducing exposure locally, and restoring
 * mid-tones and saturation.
 *
 * Why ML for this one
 *  - Pixel-space methods (e.g. "any pixel > 252/255 → darken") collapse
 *    on reflections, glossy trim, or anything that isn't a window. You
 *    need a learned mask. Same reasoning as sky-replace: CPU fallback
 *    would regress quality more often than it helps.
 *
 * Hand-off contract with the provider
 *  - Logical model `"window-pull"`. The provider's MODEL_REGISTRY entry
 *    stays `null` until per-model bakeoff pins a version. When that
 *    happens, no code change here.
 *  - `job.inputParams.target_ev`: optional target EV offset for the
 *    recovered window region (default -1.5). Sent through verbatim.
 *  - If the provider is unavailable we re-throw — this is intentionally
 *    a hard-fail so pipeline_auto can record it and keep the previous
 *    rendition intact. No silent no-ops.
 */

import type { EditJob } from "@shared/schema";
import type { HandlerResult } from "./pipeline-auto";
import { getPhotoModelProvider } from "../../services/photo-providers";
import { runSingleAssetCorrection } from "./correction-common";

export async function handleWindowPull(job: EditJob): Promise<HandlerResult> {
  return runSingleAssetCorrection(job, {
    stage: "window_pull",
    bracketStatus: "window_pulled",
    produce: async ({ inputAsset }) => {
      const provider = getPhotoModelProvider();
      const result = await provider.run({
        imageUrls: [inputAsset.sourceUrl],
        model: "window-pull",
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
