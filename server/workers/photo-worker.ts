/**
 * Photo-pipeline worker.
 *
 * For MVP we run the Worker in-process with Express. That keeps deploy
 * complexity low (one service, one Dockerfile, one Cloud Run instance)
 * and is fine for the throughput we expect in the first few months. When
 * jobs start taking long enough to starve request handling we'll split it
 * out into a dedicated worker service.
 *
 * Per-jobType concurrency tuning is deliberately conservative — Upstash
 * free tier is metered on commands, not connections, so the bottleneck is
 * actually Replicate + downstream model cost, not Redis.
 *
 * Graceful shutdown: we await the worker's close() in startPhotoWorker's
 * returned stop() fn so SIGTERM from Cloud Run never kills a job
 * mid-flight. BullMQ will re-queue anything in-flight on the next boot.
 */

import { Worker, type Job } from "bullmq";
import type { EditJob } from "@shared/schema";
import { PHOTO_QUEUE_NAME, type PhotoJobName, type PhotoJobPayload } from "../queues/photo-queue";
import { createRedisClient } from "../queues/redis-connection";
import { editJobService } from "../services/edit-job-service";
import { handlePipelineAuto, type HandlerResult } from "./handlers/pipeline-auto";
import { handleHdrMerge } from "./handlers/hdr-merge";
import { handleEnhance } from "./handlers/enhance";
import { handleWhiteBalance } from "./handlers/white-balance";
import { handlePerspective } from "./handlers/perspective";
import { handleSkyReplace } from "./handlers/sky-replace";
import { handleWindowPull } from "./handlers/window-pull";

/**
 * Map from BullMQ job name → handler fn. Add entries as handlers land.
 * An unregistered jobType throws — surfaces missing wiring immediately.
 */
type JobHandler = (dbJob: EditJob) => Promise<HandlerResult>;

const handlers: Partial<Record<PhotoJobName, JobHandler>> = {
  pipeline_auto: handlePipelineAuto,
  hdr_merge: handleHdrMerge,
  white_balance: handleWhiteBalance,
  perspective: handlePerspective,
  window_pull: handleWindowPull,
  sky_replace: handleSkyReplace,
  enhance: handleEnhance,
};

export interface WorkerHandle {
  worker: Worker<PhotoJobPayload, HandlerResult, PhotoJobName>;
  stop: () => Promise<void>;
}

export function startPhotoWorker(): WorkerHandle {
  const worker = new Worker<PhotoJobPayload, HandlerResult, PhotoJobName>(
    PHOTO_QUEUE_NAME,
    async (job: Job<PhotoJobPayload, HandlerResult, PhotoJobName>) => {
      const editJobId = job.data.editJobId;
      if (!editJobId) {
        throw new Error(`Job ${job.id} missing editJobId in payload`);
      }

      const dbJob = await editJobService.getById(editJobId);
      if (!dbJob) {
        throw new Error(`editJob ${editJobId} not found (deleted before worker picked it up?)`);
      }

      const handler = handlers[job.name];
      if (!handler) {
        // Fail loudly so the row shows the real reason instead of a
        // generic timeout later.
        await editJobService.markFailed(
          editJobId,
          `No handler registered for jobType '${job.name}'`
        );
        throw new Error(`No handler registered for jobType '${job.name}'`);
      }

      await editJobService.markRunning(editJobId);
      try {
        const result = await handler(dbJob);
        await editJobService.markSucceeded(editJobId, {
          outputAssetId: result.outputAssetId ?? null,
          costCents: result.costCents ?? null,
          durationMs: result.durationMs ?? null,
        });
        return result;
      } catch (err: any) {
        await editJobService.markFailed(editJobId, err?.message ?? String(err));
        throw err; // let BullMQ retry per defaultJobOptions
      }
    },
    {
      connection: createRedisClient(),
      // Start small. Raise per-job-type when we know the real bottleneck.
      concurrency: 2,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(
      `❌ PHOTO WORKER: job ${job?.id} (${job?.name}) failed:`,
      err?.message ?? err
    );
  });

  worker.on("completed", (job, result) => {
    console.log(
      `✅ PHOTO WORKER: job ${job.id} (${job.name}) ok in ${result?.durationMs ?? "?"}ms`
    );
  });

  worker.on("error", (err) => {
    // Connection errors, shutdown-during-work, etc. Don't crash the
    // process — BullMQ will reconnect.
    console.error("⚠️ PHOTO WORKER: worker error:", err?.message ?? err);
  });

  return {
    worker,
    stop: async () => {
      // Close waits for in-flight jobs to finish (up to lockDuration)
      // before disconnecting. Exactly what we want on SIGTERM.
      await worker.close();
    },
  };
}
