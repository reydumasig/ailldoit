/**
 * Factory for the active PhotoModelProvider.
 *
 * Resolution order:
 *   1. `PHOTO_PROVIDER=local` env var → LocalPhotoProvider (forces off)
 *   2. REPLICATE_API_TOKEN present → ReplicatePhotoProvider
 *   3. Otherwise → LocalPhotoProvider (dev / CI without tokens)
 *
 * The provider is cached per-process. A single long-lived Replicate
 * client + keepalive socket is what we want; no point re-constructing it
 * per job.
 */

import { LocalPhotoProvider } from "./local-provider";
import { ReplicatePhotoProvider } from "./replicate-provider";
import type { PhotoModelProvider } from "./types";

export * from "./types";

let cached: PhotoModelProvider | null = null;

export function getPhotoModelProvider(): PhotoModelProvider {
  if (cached) return cached;

  const forced = process.env.PHOTO_PROVIDER?.toLowerCase();
  if (forced === "local") {
    console.log("📷 PHOTO PROVIDER: local (forced by PHOTO_PROVIDER=local)");
    cached = new LocalPhotoProvider();
    return cached;
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (token && token !== "your_replicate_token_here") {
    console.log("📷 PHOTO PROVIDER: replicate");
    cached = new ReplicatePhotoProvider(token);
    return cached;
  }

  console.log(
    "📷 PHOTO PROVIDER: local (no REPLICATE_API_TOKEN — ML handlers will use CPU fallbacks or fail)"
  );
  cached = new LocalPhotoProvider();
  return cached;
}

/** Test-only — reset the memoised provider so env changes take effect. */
export function __resetPhotoModelProviderForTest() {
  cached = null;
}
