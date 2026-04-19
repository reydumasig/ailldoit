/**
 * pipeline_auto handler — the "run everything" orchestrator.
 *
 * Current behaviour:
 *   - bracket group set → HDR merge, then an enhance polish pass on the
 *     merged output. Further steps (white_balance, perspective, window_pull)
 *     will slot in between HDR and enhance as those handlers land.
 *   - no bracket / no asset → noop (used by the **Test queue** button for
 *     BullMQ plumbing validation).
 *
 * We run each step inline (same edit_jobs row) rather than enqueueing
 * child jobs so that for MVP there's one job row per user click. When we
 * want per-step cost/duration visibility we'll switch to BullMQ
 * FlowProducer + proper parent/child rows.
 *
 * Enhance is best-effort: a failure (e.g., Replicate token issue) does
 * NOT fail the whole pipeline — the HDR preview alone is already a
 * deliverable. We surface the enhance error in the log but return
 * success so the user sees their merged image.
 */

import type { EditJob } from "@shared/schema";
import { handleHdrMerge } from "./hdr-merge";
import { handleEnhance } from "./enhance";

export interface HandlerResult {
  costCents?: number;
  durationMs?: number;
  outputAssetId?: number;
  providerMeta?: Record<string, unknown>;
}

export async function handlePipelineAuto(job: EditJob): Promise<HandlerResult> {
  const started = Date.now();
  console.log(
    `🎞️  PIPELINE_AUTO: editJob=${job.id} project=${job.projectId} bracket=${job.bracketGroupId ?? "-"} asset=${job.assetId ?? "-"}`
  );

  if (job.bracketGroupId) {
    const hdr = await handleHdrMerge(job);

    // Polish pass. Isolated from HDR so a provider blip doesn't lose the
    // user's HDR output. The enhance step updates bracketGroups.mergedAssetId
    // to the polished rendition, so the UI automatically shows the
    // improved version when available.
    let enhanceResult: Awaited<ReturnType<typeof handleEnhance>> | null = null;
    try {
      enhanceResult = await handleEnhance(job);
      console.log(
        `✨ PIPELINE_AUTO: enhance ok — version bumped (asset=${enhanceResult.outputAssetId})`
      );
    } catch (err) {
      console.warn(
        `⚠️ PIPELINE_AUTO: enhance step failed — keeping HDR output. ${(err as Error).message}`
      );
    }

    return {
      outputAssetId: enhanceResult?.outputAssetId ?? hdr.outputAssetId,
      costCents: (hdr.costCents ?? 0) + (enhanceResult?.costCents ?? 0),
      durationMs: Date.now() - started,
      providerMeta: enhanceResult?.providerMeta,
    };
  }

  // No bracket, no asset — this is the "Test queue" button. Prove the
  // plumbing works and return.
  await new Promise((r) => setTimeout(r, 500));
  return {
    costCents: 0,
    durationMs: Date.now() - started,
  };
}
