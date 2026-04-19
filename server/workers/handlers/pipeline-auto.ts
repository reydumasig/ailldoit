/**
 * pipeline_auto handler — the "run everything" orchestrator.
 *
 * Current behaviour:
 *   - bracket group set → HDR merge (hard-fail) → a best-effort chain of
 *     editorial passes:
 *
 *        hdr_merge  →  white_balance  →  perspective  →  window_pull
 *                   →  sky_replace    →  enhance
 *
 *     Each step after HDR runs best-effort: a provider blip, a
 *     `ProviderUnavailableError`, or a genuinely failing step does NOT fail
 *     the whole pipeline. The merged HDR rendition is already a deliverable
 *     on its own — the corrections are gravy. We log and move on.
 *
 *   - no bracket / no asset → noop (used by the **Test queue** button for
 *     BullMQ plumbing validation).
 *
 * Why inline and not BullMQ child jobs
 *   We run each step inline (same edit_jobs row) rather than enqueueing
 *   child jobs so that for MVP there's one job row per user click. This
 *   keeps the UI simple — one "progress" row per request. When we want
 *   per-step cost/duration visibility we'll switch to BullMQ FlowProducer
 *   + proper parent/child rows. Until then the version chain on the input
 *   asset is our audit trail.
 *
 * Why each step can safely chain
 *   Every correction handler resolves its input via the bracket group's
 *   `mergedAssetId`, produces a new derived asset, and updates
 *   `bracketGroups.mergedAssetId` to point at the new rendition — all in
 *   one transaction. So step N automatically picks up the output of step
 *   N-1 without any special "current asset" plumbing here.
 *
 * Cost accounting
 *   We sum costCents across all steps. Local fallbacks contribute 0,
 *   provider runs contribute whatever the provider billed. The final
 *   providerMeta reflects the *last* step that actually produced output
 *   (which is usually enhance).
 */

import type { EditJob } from "@shared/schema";
import { handleHdrMerge } from "./hdr-merge";
import { handleEnhance } from "./enhance";
import { handleWhiteBalance } from "./white-balance";
import { handlePerspective } from "./perspective";
import { handleWindowPull } from "./window-pull";
import { handleSkyReplace } from "./sky-replace";

export interface HandlerResult {
  costCents?: number;
  durationMs?: number;
  outputAssetId?: number;
  providerMeta?: Record<string, unknown>;
}

/**
 * Ordered list of best-effort steps that run after HDR merge. The name is
 * only used for logging — the handler is what actually runs.
 */
const POST_HDR_STEPS: Array<{
  name: string;
  run: (job: EditJob) => Promise<HandlerResult>;
}> = [
  { name: "white_balance", run: handleWhiteBalance },
  { name: "perspective", run: handlePerspective },
  { name: "window_pull", run: handleWindowPull },
  { name: "sky_replace", run: handleSkyReplace },
  { name: "enhance", run: handleEnhance },
];

export async function handlePipelineAuto(job: EditJob): Promise<HandlerResult> {
  const started = Date.now();
  console.log(
    `🎞️  PIPELINE_AUTO: editJob=${job.id} project=${job.projectId} bracket=${job.bracketGroupId ?? "-"} asset=${job.assetId ?? "-"}`
  );

  if (job.bracketGroupId) {
    // Step 1 is HARD — if we can't produce an HDR merge there's nothing
    // for later steps to operate on. Let it throw.
    const hdr = await handleHdrMerge(job);

    let totalCost = hdr.costCents ?? 0;
    let lastOutputAssetId = hdr.outputAssetId;
    let lastProviderMeta: Record<string, unknown> | undefined =
      hdr.providerMeta;

    // Each subsequent step is best-effort. A failure here must not
    // clobber the HDR rendition the user is already entitled to see.
    for (const step of POST_HDR_STEPS) {
      try {
        const result = await step.run(job);
        totalCost += result.costCents ?? 0;
        if (result.outputAssetId) {
          lastOutputAssetId = result.outputAssetId;
        }
        if (result.providerMeta) {
          lastProviderMeta = result.providerMeta;
        }
        console.log(
          `✨ PIPELINE_AUTO: ${step.name} ok — version bumped (asset=${result.outputAssetId ?? "?"})`
        );
      } catch (err) {
        console.warn(
          `⚠️ PIPELINE_AUTO: ${step.name} step failed — keeping previous rendition. ${(err as Error).message}`
        );
      }
    }

    return {
      outputAssetId: lastOutputAssetId,
      costCents: totalCost,
      durationMs: Date.now() - started,
      providerMeta: lastProviderMeta,
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
