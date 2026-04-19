/**
 * LocalPhotoProvider — null backend for dev without REPLICATE_API_TOKEN.
 *
 * `run()` always throws `ProviderUnavailableError`. Handlers that can fall
 * back to CPU implementations (gray-world white balance, simple unsharp
 * enhance) catch this and degrade gracefully. Handlers that REQUIRE a
 * model (sky replace, virtual stage) will surface the error as a job
 * failure — which is the correct behaviour: without a provider the user
 * can't run those operations.
 *
 * We keep this provider active in dev so a fresh clone runs end-to-end
 * for HDR (pure CPU) without anyone needing to paste tokens.
 */

import {
  ProviderUnavailableError,
  type PhotoModelProvider,
  type PhotoModelRunInput,
  type PhotoModelRunResult,
} from "./types";

export class LocalPhotoProvider implements PhotoModelProvider {
  readonly name = "local";

  async run(input: PhotoModelRunInput): Promise<PhotoModelRunResult> {
    throw new ProviderUnavailableError(
      `Local provider has no backend for model "${input.model}". ` +
        `Set REPLICATE_API_TOKEN to use the Replicate provider, or use a handler with a CPU fallback.`,
      input.model
    );
  }
}
