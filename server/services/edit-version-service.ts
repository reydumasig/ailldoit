/**
 * edit-version-service — read access to the version chain for an asset.
 *
 * One row per rendition: HDR merge lands v1, enhance lands v2, future
 * white-balance / perspective passes bump further. `isCurrent=true`
 * is always exactly one row per asset and represents what the UI
 * shows by default.
 *
 * Writes live in the handlers (hdr-merge, enhance) inside their own
 * transactions — we never want a version row to exist without the
 * accompanying derived photoAsset. This service is read-only for now.
 */

import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { editJobs, editVersions, type EditJob, type EditVersion } from "@shared/schema";

export interface EditVersionWithJob extends EditVersion {
  job: Pick<EditJob, "id" | "jobType" | "status" | "costCents" | "durationMs" | "completedAt"> | null;
}

export class EditVersionService {
  /**
   * List versions for an asset, newest first. Joins the originating
   * edit_jobs row so the UI can show "HDR merge · 2s · $0.00" per entry.
   */
  async listByAsset(assetId: number): Promise<EditVersionWithJob[]> {
    const rows = await db
      .select({
        version: editVersions,
        job: {
          id: editJobs.id,
          jobType: editJobs.jobType,
          status: editJobs.status,
          costCents: editJobs.costCents,
          durationMs: editJobs.durationMs,
          completedAt: editJobs.completedAt,
        },
      })
      .from(editVersions)
      .leftJoin(editJobs, eq(editVersions.jobId, editJobs.id))
      .where(eq(editVersions.assetId, assetId))
      .orderBy(desc(editVersions.versionNumber));

    return rows.map((r) => ({ ...r.version, job: r.job }));
  }
}

export const editVersionService = new EditVersionService();
