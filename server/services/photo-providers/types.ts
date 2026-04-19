/**
 * PhotoModelProvider — abstraction over "run an image through a model".
 *
 * We keep the interface deliberately narrow: one `run()` method that takes
 * input image URL(s), a logical model name, and optional params, and
 * returns the output image URL plus cost/duration for ledger writes.
 *
 * Handlers speak in *logical* model ids (`"white-balance"`, `"enhance"`,
 * `"sky-replace"`). Each provider maps those to its concrete backend —
 * Replicate model versions today, Modal/self-hosted later. Swapping providers
 * is a one-line change in the factory, not a rewrite of every handler.
 *
 * Cost is reported in USD cents so it sums cleanly against Stripe SKUs
 * (Week 5-6) and the photo_credit_ledger.
 */

/** Logical models the pipeline knows how to ask for. */
export type PhotoModelId =
  | "white-balance"       // gray-world / ML colour cast correction
  | "perspective"         // vertical-line / keystone correction
  | "window-pull"         // highlight recovery on windows
  | "sky-replace"         // sky segmentation + composite
  | "enhance";            // general contrast/vibrance/noise polish

export interface PhotoModelRunInput {
  /** URLs of source images — usually one, many for multi-input models. */
  imageUrls: string[];
  /** Logical model the caller wants. Provider resolves this to a concrete backend. */
  model: PhotoModelId;
  /** Model-specific params (strength, mask prompt, target EV, etc.). */
  params?: Record<string, unknown>;
  /** DB correlation — used for logging, not sent to the backend. */
  editJobId: number;
  projectId: number;
  orgId?: number | null;
}

export interface PhotoModelRunResult {
  /** Signed/public URL of the produced image. Caller uploads it to Firebase. */
  outputUrl: string;
  /** Provider-reported cost in USD cents (integer). 0 if the provider is free/stub. */
  costCents: number;
  /** Wall-clock duration of the provider call. */
  durationMs: number;
  /** Opaque bag for debugging — Replicate prediction id, model version, etc. */
  providerMeta?: Record<string, unknown>;
}

/**
 * A provider is bound to a single backend (Replicate, Modal, self-hosted).
 * Implementations are stateless — safe to reuse across jobs.
 */
export interface PhotoModelProvider {
  /** Human-readable provider id. Shows up in logs and job.providerMeta. */
  readonly name: string;
  run(input: PhotoModelRunInput): Promise<PhotoModelRunResult>;
}

/**
 * Thrown when a model is asked for but the active provider can't fulfil it.
 * Handlers catch this to fall back to the local CPU implementation (e.g.
 * gray-world white balance) so the pipeline stays useful without a token.
 */
export class ProviderUnavailableError extends Error {
  constructor(message: string, readonly model: PhotoModelId) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}
