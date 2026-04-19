/**
 * Photo-pipeline job queue (BullMQ on Upstash Redis).
 *
 * Every AI edit operation runs as an async job:
 *   - pipeline_auto — orchestrator that runs the whole MVP pipeline for a
 *     bracket group (HDR merge → white balance → perspective → enhance).
 *     Currently a noop; real implementations land job-by-job over the next
 *     2 weeks.
 *   - hdr_merge / white_balance / perspective / window_pull / sky_replace /
 *     enhance — individual edit primitives (Weeks 2–3).
 *
 * We use a single queue `photo-jobs` with different `name` values per job
 * type; the worker routes by name. Keeps queue-admin simple (one dashboard,
 * one DLQ strategy) without sacrificing per-job-type retry/concurrency.
 */

import { Queue, type JobsOptions } from "bullmq";
import { createRedisClient } from "./redis-connection";

export const PHOTO_QUEUE_NAME = "photo-jobs";

/** Every edit_jobs.jobType that can land on the queue. */
export type PhotoJobName =
  | "pipeline_auto"
  | "hdr_merge"
  | "white_balance"
  | "perspective"
  | "window_pull"
  | "sky_replace"
  | "enhance";

/**
 * Every BullMQ job payload MUST include editJobId — that's the DB row the
 * worker hydrates + updates. Job-type-specific params live on the edit_jobs
 * row (inputParams column), not duplicated on the BullMQ payload, so we
 * have one source of truth.
 */
export interface PhotoJobPayload {
  editJobId: number;
}

// Dedicated connection per the BullMQ docs — sharing with the worker's
// client causes deadlocks on blocking reads.
export const photoQueue = new Queue<PhotoJobPayload, unknown, PhotoJobName>(
  PHOTO_QUEUE_NAME,
  {
    connection: createRedisClient(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { count: 1_000, age: 24 * 60 * 60 },
      removeOnFail: { count: 5_000, age: 7 * 24 * 60 * 60 },
    } satisfies JobsOptions,
  }
);

/**
 * Enqueue a photo job. Thin wrapper so callers don't depend on BullMQ
 * directly — easier to swap queue backends if we ever outgrow Upstash.
 */
export async function enqueuePhotoJob(
  name: PhotoJobName,
  payload: PhotoJobPayload,
  opts?: JobsOptions
) {
  const job = await photoQueue.add(name, payload, opts);
  return { jobId: job.id!, name };
}
