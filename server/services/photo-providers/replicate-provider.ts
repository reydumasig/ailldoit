/**
 * ReplicatePhotoProvider — calls Replicate for image-to-image models.
 *
 * Why Replicate (not direct model hosting) for MVP:
 *   - Pay-per-second, no idle GPU bills while the MVP has <50 users.
 *   - Catalog of ready-to-call models for every step we want in Weeks 3–6.
 *   - Swapping to Modal or self-hosted is a provider-level change later —
 *     handlers don't move.
 *
 * Model versions are pinned here intentionally. Replicate lets you pass
 * `owner/name` without a version hash, but the behaviour can drift
 * silently when the model author retrains. Pinning means we re-run the
 * bakeoff on purpose, not by surprise.
 *
 * Cost tracking: Replicate returns `predictTime` in seconds and each
 * model has a hardware tier price. Rather than hard-coding a per-model
 * cost-per-second (which drifts), we read `metrics.predict_time` from
 * the prediction and multiply by a conservative default. This is a rough
 * approximation for MVP — the ledger will be reconciled against
 * Replicate's billing dashboard monthly until we wire their webhook.
 */

import Replicate from "replicate";
import {
  ProviderUnavailableError,
  type PhotoModelId,
  type PhotoModelProvider,
  type PhotoModelRunInput,
  type PhotoModelRunResult,
} from "./types";

/**
 * Logical model id → Replicate model reference (owner/name[:version]).
 * TODO (Week 3+): pick concrete versions after model bakeoff. Entries
 * with `null` throw ProviderUnavailableError until we pin them — that's
 * safer than silently calling the wrong model.
 */
const MODEL_REGISTRY: Record<PhotoModelId, string | null> = {
  // Placeholder — bakeoff in week 3. We'll compare a couple of ML white-
  // balance models against gray-world before pinning a version.
  "white-balance": null,
  // Keystone / vertical line correction; likely a classical OpenCV pass
  // that we implement locally, not a Replicate call.
  "perspective": null,
  // Highlight recovery on windows. Uses an HDR-fusion or tone-mapping
  // model; pending bakeoff.
  "window-pull": null,
  // Sky segmentation + composite. Candidates: `jingyunliang/swinir` for
  // segmentation → custom compositing. Pending bakeoff.
  "sky-replace": null,
  // General polish pass. GFPGAN-style or bespoke real-estate tuned model.
  // Pending bakeoff.
  "enhance": null,
};

/** USD cents per prediction-second. Conservative default — refine per model after bakeoff. */
const DEFAULT_COST_CENTS_PER_SECOND = 0.2; // ~ $0.002/s (T4-class)

export class ReplicatePhotoProvider implements PhotoModelProvider {
  readonly name = "replicate";
  private client: Replicate;

  constructor(apiToken: string) {
    this.client = new Replicate({ auth: apiToken });
  }

  async run(input: PhotoModelRunInput): Promise<PhotoModelRunResult> {
    const modelRef = MODEL_REGISTRY[input.model];
    if (!modelRef) {
      throw new ProviderUnavailableError(
        `Replicate provider has no pinned version for "${input.model}" yet. ` +
          `Add it to MODEL_REGISTRY after the bakeoff.`,
        input.model
      );
    }

    const started = Date.now();
    console.log(
      `🧠 REPLICATE: editJob=${input.editJobId} model=${input.model} ref=${modelRef}`
    );

    // `run()` blocks until the prediction finishes. For long-running
    // models we'll switch to `predictions.create()` + webhook in Week 6;
    // for MVP single-image passes (5–30s) blocking is fine.
    const output = await this.client.run(modelRef as `${string}/${string}`, {
      input: {
        image: input.imageUrls[0],
        ...(input.params ?? {}),
      },
    });

    const outputUrl = extractOutputUrl(output);
    if (!outputUrl) {
      throw new Error(
        `Replicate model ${modelRef} returned no image URL (got ${JSON.stringify(output).slice(0, 200)})`
      );
    }

    const durationMs = Date.now() - started;
    const costCents = Math.round(
      (durationMs / 1000) * DEFAULT_COST_CENTS_PER_SECOND
    );

    return {
      outputUrl,
      costCents,
      durationMs,
      providerMeta: { provider: this.name, modelRef },
    };
  }
}

/**
 * Replicate models return either a string URL, an array of strings, or
 * (for streaming models) an async iterable of file refs. We only need
 * the first image URL for the pipeline's image-to-image steps.
 */
function extractOutputUrl(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  // New Replicate SDK returns ReadableStream-like objects with `.url()`.
  if (
    output &&
    typeof output === "object" &&
    "url" in output &&
    typeof (output as { url: () => URL }).url === "function"
  ) {
    try {
      return (output as { url: () => URL }).url().toString();
    } catch {
      return null;
    }
  }
  return null;
}
